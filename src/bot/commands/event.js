
require('dotenv').config();
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { create_embed } = require('./rank_guild');
const { get_event_counts } = require('../utils/get_ironman_skyblock_xp');
const { send_log_message } = require('../utils/send_log_message');

const {
    EVENT_DEFAULT_NAME,
    EVENT_SNAPSHOT_BATCH_SIZE,
    EVENT_SNAPSHOT_BATCH_DELAY_MS,
    EVENT_SNAPSHOT_TICK_MS,
    EVENT_SNAPSHOT_CLAIM_TIMEOUT_MS,
    EVENT_HOURLY_SNAPSHOT_INTERVAL_MS,
    EVENT_HOURLY_SNAPSHOT_OFFSET_MS,
    EVENT_HYPIXEL_MAX_ATTEMPTS,
    EVENT_SIGNUP_HYPIXEL_CONCURRENCY,
    EVENT_LEADERBOARD_PAGE_SIZE,
} = require('../constants');
const EVENT_LOCK_NAME = 'vanguard_corpse_event_active';
const ACTIVE_RUN_STATUSES = ['PENDING', 'PROCESSING'];
const SIGNUP_OPEN_EVENT_STATUSES = ['SIGNUP', 'RUNNING'];
const SIGNUP_CLOSED_EVENT_STATUSES = ['ENDING', 'ENDED'];
const EVENT_CONFIRM_PASSWORD = 'LanceIsBald';
const EVENT_BUTTON_PREFIX = 'event_confirm_';
const EVENT_LEADERBOARD_BUTTON_PREFIX = 'event_leaderboard_';

const event_command = new SlashCommandBuilder()
    .setName('event')
    .setDescription('Vanguard Corpse event commands')
    .setDMPermission(false)
    .addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new Vanguard Corpse event')
            .addStringOption(option =>
                option
                    .setName('password')
                    .setDescription('Confirmation password')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('signup')
            .setDescription('Sign up for the current Vanguard Corpse event'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('leaderboard')
            .setDescription('View the Vanguard Corpse event leaderboard'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('start')
            .setDescription('Start the current Vanguard Corpse event'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('end')
            .setDescription('End the current Vanguard Corpse event')
            .addStringOption(option =>
                option
                    .setName('password')
                    .setDescription('Confirmation password')
                    .setRequired(true)));

const ensure_moderator_permissions = interaction => {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers);
};

const build_event_confirmation_buttons = customId => {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`${customId}_cancel`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
};

const build_event_confirm_custom_id = (action, discordUserId, eventId = 'none') => {
    return `${EVENT_BUTTON_PREFIX}${action}:${discordUserId}:${eventId}`;
};

const parse_event_confirm_custom_id = customId => {
    if (!customId.startsWith(EVENT_BUTTON_PREFIX)) {
        return null;
    }

    const payload = customId.slice(EVENT_BUTTON_PREFIX.length);
    const [action, discordUserId, eventIdWithSuffix] = payload.split(':');
    if (!action || !discordUserId || !eventIdWithSuffix) {
        return null;
    }

    const eventId = eventIdWithSuffix.replace(/_cancel$/, '');
    return {
        action,
        discordUserId,
        eventId: eventId === 'none' ? null : Number(eventId),
        cancelled: customId.endsWith('_cancel'),
    };
};

const has_valid_event_password = interaction => {
    return interaction.options.getString('password') === EVENT_CONFIRM_PASSWORD;
};

const create_concurrency_limiter = limit => {
    const maxConcurrency = Math.max(1, Number(limit) || 1);
    const queue = [];
    let activeCount = 0;

    const tryRunNext = () => {
        if (activeCount >= maxConcurrency || !queue.length) {
            return;
        }

        const { work, resolve, reject } = queue.shift();
        activeCount += 1;
        Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
                activeCount -= 1;
                tryRunNext();
            });
    };

    return work => new Promise((resolve, reject) => {
        queue.push({ work, resolve, reject });
        tryRunNext();
    });
};

const signup_hypixel_lookup_limiter = create_concurrency_limiter(EVENT_SIGNUP_HYPIXEL_CONCURRENCY);

const run_in_transaction = async (db, work) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const get_named_lock = async (connection, lockName) => {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 10) AS locked', [lockName]);
    return rows[0]?.locked === 1;
};

const release_named_lock = async (connection, lockName) => {
    await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
};

const get_active_event = async db => {
    const [rows] = await db.query('SELECT * FROM events WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1');
    return rows[0] || null;
};

const get_event_by_id = async (db, eventId) => {
    const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
    return rows[0] || null;
};

const get_active_event_for_update = async db => {
    const [rows] = await db.query('SELECT * FROM events WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE');
    return rows[0] || null;
};

const get_event_by_id_for_update = async (db, eventId) => {
    const [rows] = await db.query('SELECT * FROM events WHERE id = ? FOR UPDATE', [eventId]);
    return rows[0] || null;
};

const get_current_leaderboard_event = async db => {
    const activeEvent = await get_active_event(db);
    if (activeEvent) {
        return activeEvent;
    }

    const [rows] = await db.query(
        'SELECT * FROM events WHERE status = ? ORDER BY ended_at DESC, created_at DESC LIMIT 1',
        ['ENDED']
    );
    return rows[0] || null;
};

const get_linked_minecraft_account = async (db, discordUserId) => {
    const [rows] = await db.query(
        'SELECT discord_id, ign, uuid FROM members WHERE discord_id = ? LIMIT 1',
        [discordUserId]
    );
    return rows[0] || null;
};

const create_signup_event = async (db, now) => {
    return run_in_transaction(db, async connection => {
        const locked = await get_named_lock(connection, EVENT_LOCK_NAME);
        if (!locked) {
            throw new Error('Failed to acquire event creation lock.');
        }

        try {
            const [activeRows] = await connection.query(
                'SELECT * FROM events WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE'
            );
            if (activeRows[0]) {
                return activeRows[0];
            }

            const [result] = await connection.query(
                'INSERT INTO events (name, event_type, status, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
                [EVENT_DEFAULT_NAME, 'VANGUARD_CORPSE', 'SIGNUP', now]
            );
            const [rows] = await connection.query('SELECT * FROM events WHERE id = ?', [result.insertId]);
            return rows[0] || null;
        } finally {
            await release_named_lock(connection, EVENT_LOCK_NAME);
        }
    });
};

const get_signup_event = async db => {
    const activeEvent = await get_active_event(db);
    if (!activeEvent) {
        return null;
    }

    if (!SIGNUP_OPEN_EVENT_STATUSES.includes(activeEvent.status)) {
        return activeEvent;
    }

    return activeEvent;
};

const get_event_participant_by_discord_id = async (db, eventId, discordUserId) => {
    const [rows] = await db.query(
        'SELECT * FROM event_participants WHERE event_id = ? AND discord_user_id = ? LIMIT 1',
        [eventId, discordUserId]
    );
    return rows[0] || null;
};

const get_event_participant_by_minecraft_uuid = async (db, eventId, minecraftUuid) => {
    const [rows] = await db.query(
        'SELECT * FROM event_participants WHERE event_id = ? AND minecraft_uuid = ? LIMIT 1',
        [eventId, minecraftUuid]
    );
    return rows[0] || null;
};

const list_event_participants = async (db, eventId) => {
    const [rows] = await db.query(
        'SELECT * FROM event_participants WHERE event_id = ? ORDER BY signup_at ASC, id ASC',
        [eventId]
    );
    return rows;
};

const has_active_snapshot_run = async (db, eventId) => {
    const [rows] = await db.query(
        'SELECT id FROM event_snapshot_runs WHERE event_id = ? AND status IN (?) LIMIT 1',
        [eventId, ACTIVE_RUN_STATUSES]
    );
    return rows.length > 0;
};

const list_active_snapshot_runs = async (db, eventId) => {
    const [rows] = await db.query(
        `SELECT * FROM event_snapshot_runs
         WHERE event_id = ? AND status IN (?)
         ORDER BY started_at ASC, id ASC`,
        [eventId, ACTIVE_RUN_STATUSES]
    );
    return rows;
};

const update_event_status = async (db, eventId, fields) => {
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
        updates.push(`${key} = ?`);
        values.push(value);
    }

    values.push(eventId);
    await db.query(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
    return rows[0] || null;
};

const create_event_participant = async (db, participant) => {
    const [result] = await db.query(
        `INSERT INTO event_participants (
            event_id,
            discord_user_id,
            minecraft_uuid,
            minecraft_username,
            signup_corpse_count,
            signup_overall_corpse_count,
            signup_glacite_powder,
            signup_lapis_corpse_count,
            signup_tungsten_corpse_count,
            signup_umber_corpse_count,
            signup_glacite_powder_available,
            signup_glacite_powder_spent,
            signup_at,
            profile_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            participant.eventId,
            participant.discordUserId,
            participant.minecraftUuid,
            participant.minecraftUsername,
            participant.signupCorpseCount,
            participant.signupOverallCorpseCount ?? null,
            participant.signupGlacitePowder ?? null,
            participant.signupLapisCorpseCount ?? null,
            participant.signupTungstenCorpseCount ?? null,
            participant.signupUmberCorpseCount ?? null,
            participant.signupGlacitePowderAvailable ?? null,
            participant.signupGlacitePowderSpent ?? null,
            participant.signupAt,
            participant.profileId ?? null,
        ]
    );

    const [rows] = await db.query('SELECT * FROM event_participants WHERE id = ?', [result.insertId]);
    return rows[0] || null;
};
const compute_snapshot_bucket = (snapshotType, startedAt) => {
    if (snapshotType === 'INITIAL') {
        return null;
    }

    if (snapshotType !== 'HOURLY') {
        return snapshotType;
    }

    const hour = Math.floor(startedAt / EVENT_HOURLY_SNAPSHOT_INTERVAL_MS) * EVENT_HOURLY_SNAPSHOT_INTERVAL_MS;
    return new Date(hour).toISOString();
};

const create_snapshot_run_with_tasks_in_connection = async (connection, options) => {
    const {
        eventId,
        snapshotType,
        batchSize,
        batchDelayMs,
        startedAt,
        allowExisting = false,
    } = options;

    const participants = await list_event_participants(connection, eventId);
    const totalParticipants = participants.length;
    const initialStatus = totalParticipants === 0 ? 'COMPLETED' : 'PENDING';
    const completedAt = totalParticipants === 0 ? startedAt : null;
    const snapshotBucket = compute_snapshot_bucket(snapshotType, startedAt);

    try {
        const [runResult] = await connection.query(
            `INSERT INTO event_snapshot_runs (
                event_id,
                snapshot_type,
                snapshot_bucket,
                status,
                batch_size,
                batch_delay_ms,
                started_at,
                next_batch_at,
                completed_at,
                total_participants
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                eventId,
                snapshotType,
                snapshotBucket,
                initialStatus,
                batchSize,
                batchDelayMs,
                startedAt,
                startedAt,
                completedAt,
                totalParticipants,
            ]
        );

        const snapshotRunId = runResult.insertId;
        if (participants.length) {
            const values = participants.map(participant => [
                snapshotRunId,
                participant.id,
                'PENDING',
                startedAt,
            ]);

            await connection.query(
                `INSERT INTO event_snapshot_tasks (
                    snapshot_run_id,
                    participant_id,
                    status,
                    available_at
                ) VALUES ?`,
                [values]
            );
        }

        const [rows] = await connection.query('SELECT * FROM event_snapshot_runs WHERE id = ?', [snapshotRunId]);
        return { created: true, run: rows[0], participantCount: totalParticipants };
    } catch (error) {
        if (allowExisting && error?.code === 'ER_DUP_ENTRY' && snapshotBucket) {
            const [rows] = await connection.query(
                'SELECT * FROM event_snapshot_runs WHERE event_id = ? AND snapshot_type = ? AND snapshot_bucket = ? LIMIT 1',
                [eventId, snapshotType, snapshotBucket]
            );
            return { created: false, run: rows[0] || null, participantCount: rows[0]?.total_participants ?? 0 };
        }
        throw error;
    }
};

const create_snapshot_run_with_tasks = async (db, options) => {
    return run_in_transaction(db, async connection => {
        return create_snapshot_run_with_tasks_in_connection(connection, options);
    });
};

const insert_event_snapshot = async (db, payload) => {
    await db.query(
        `INSERT INTO event_snapshots (
            snapshot_run_id, event_id, participant_id, snapshot_type, corpse_count, overall_corpse_count, glacite_powder, lapis_corpse_count, tungsten_corpse_count, umber_corpse_count, glacite_powder_available, glacite_powder_spent, captured_at, is_final_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            corpse_count = VALUES(corpse_count),
            overall_corpse_count = VALUES(overall_corpse_count),
            glacite_powder = VALUES(glacite_powder),
            lapis_corpse_count = VALUES(lapis_corpse_count),
            tungsten_corpse_count = VALUES(tungsten_corpse_count),
            umber_corpse_count = VALUES(umber_corpse_count),
            glacite_powder_available = VALUES(glacite_powder_available),
            glacite_powder_spent = VALUES(glacite_powder_spent),
            captured_at = VALUES(captured_at),
            is_final_snapshot = VALUES(is_final_snapshot)`,
        [
            payload.snapshotRunId,
            payload.eventId,
            payload.participantId,
            payload.snapshotType,
            payload.corpseCount,
            payload.overallCorpseCount ?? null,
            payload.glacitePowder ?? null,
            payload.lapisCorpseCount ?? null,
            payload.tungstenCorpseCount ?? null,
            payload.umberCorpseCount ?? null,
            payload.glacitePowderAvailable ?? null,
            payload.glacitePowderSpent ?? null,
            payload.capturedAt,
            payload.snapshotType === 'FINAL' ? 1 : 0,
        ]
    );
};

const create_initial_signup_snapshot = async (connection, payload) => {
    const baselineAt = payload.capturedAt || payload.startedAt;
    const [runResult] = await connection.query(
        `INSERT INTO event_snapshot_runs (
            event_id,
            snapshot_type,
            snapshot_bucket,
            status,
            batch_size,
            batch_delay_ms,
            started_at,
            next_batch_at,
            completed_at,
            total_participants
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.eventId,
            'INITIAL',
            compute_snapshot_bucket('INITIAL', baselineAt),
            'COMPLETED',
            1,
            0,
            baselineAt,
            baselineAt,
            baselineAt,
            1,
        ]
    );

    await insert_event_snapshot(connection, {
        snapshotRunId: runResult.insertId,
        eventId: payload.eventId,
        participantId: payload.participantId,
        snapshotType: 'INITIAL',
        corpseCount: payload.corpseCount,
        overallCorpseCount: payload.overallCorpseCount,
        glacitePowder: payload.glacitePowder,
        lapisCorpseCount: payload.lapisCorpseCount,
        tungstenCorpseCount: payload.tungstenCorpseCount,
        umberCorpseCount: payload.umberCorpseCount,
        glacitePowderAvailable: payload.glacitePowderAvailable,
        glacitePowderSpent: payload.glacitePowderSpent,
        capturedAt: baselineAt,
    });

    await update_snapshot_run_progress(connection, runResult.insertId, {
        status: 'COMPLETED',
        nextBatchAt: baselineAt,
        completedAt: baselineAt,
        succeededCount: 1,
        failedCount: 0,
        lastError: null,
    });

    const [rows] = await connection.query('SELECT * FROM event_snapshot_runs WHERE id = ?', [runResult.insertId]);
    return rows[0] || null;
};

const list_ready_snapshot_runs = async (db, now) => {
    const [rows] = await db.query(
        `SELECT * FROM event_snapshot_runs
         WHERE status IN (?) AND next_batch_at <= ?
         ORDER BY started_at ASC, id ASC`,
        [ACTIVE_RUN_STATUSES, now]
    );
    return rows;
};

const release_stale_processing_tasks = async (db, staleBefore, now) => {
    const [result] = await db.query(
        `UPDATE event_snapshot_tasks
         SET status = 'PENDING',
             claim_token = NULL,
             available_at = CASE WHEN available_at < ? THEN ? ELSE available_at END
         WHERE status = 'PROCESSING' AND claimed_at IS NOT NULL AND claimed_at < ?`,
        [now, now, staleBefore]
    );
    return result.affectedRows || 0;
};

const claim_snapshot_tasks = async (db, snapshotRunId, batchSize, now, claimToken) => {
    return run_in_transaction(db, async connection => {
        const [candidateRows] = await connection.query(
            `SELECT id
             FROM event_snapshot_tasks
             WHERE snapshot_run_id = ? AND status = 'PENDING' AND available_at <= ?
             ORDER BY id ASC
             LIMIT ?
             FOR UPDATE`,
            [snapshotRunId, now, batchSize]
        );

        if (!candidateRows.length) {
            return [];
        }

        const candidateIds = candidateRows.map(row => row.id);
        await connection.query(
            `UPDATE event_snapshot_tasks
             SET status = 'PROCESSING', claimed_at = ?, claim_token = ?
             WHERE id IN (?) AND status = 'PENDING'`,
            [now, claimToken, candidateIds]
        );

        const [claimedRows] = await connection.query(
            `SELECT task.*, participant.event_id, participant.discord_user_id, participant.minecraft_uuid,
                    participant.minecraft_username, participant.signup_corpse_count, participant.profile_id
             FROM event_snapshot_tasks task
             JOIN event_participants participant ON participant.id = task.participant_id
             WHERE task.claim_token = ?
             ORDER BY task.id ASC`,
            [claimToken]
        );
        return claimedRows;
    });
};

const mark_snapshot_task_succeeded = async (db, payload) => {
    await insert_event_snapshot(db, payload);

    await db.query(
        `UPDATE event_snapshot_tasks
         SET status = 'SUCCEEDED', completed_at = ?, last_attempt_at = ?, claim_token = NULL,
             failure_code = NULL, failure_message = NULL, attempt_count = attempt_count + 1
         WHERE id = ?`,
        [payload.capturedAt, payload.capturedAt, payload.taskId]
    );
};

const mark_snapshot_task_failed = async (db, payload) => {
    await db.query(
        `UPDATE event_snapshot_tasks
         SET status = 'FAILED', completed_at = ?, last_attempt_at = ?, claim_token = NULL,
             failure_code = ?, failure_message = ?, attempt_count = attempt_count + 1
         WHERE id = ?`,
        [payload.completedAt, payload.completedAt, payload.failureCode, payload.failureMessage, payload.taskId]
    );
};

const mark_snapshot_task_for_retry = async (db, payload) => {
    await db.query(
        `UPDATE event_snapshot_tasks
         SET status = 'PENDING', claim_token = NULL, available_at = ?, failure_code = ?,
             failure_message = ?, last_attempt_at = ?, attempt_count = attempt_count + 1
         WHERE id = ?`,
        [payload.availableAt, payload.failureCode, payload.failureMessage, payload.lastAttemptAt, payload.taskId]
    );
};
const get_snapshot_run_counts = async (db, snapshotRunId) => {
    const [rows] = await db.query(
        `SELECT
            COUNT(*) AS total_count,
            SUM(CASE WHEN status = 'SUCCEEDED' THEN 1 ELSE 0 END) AS succeeded_count,
            SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) AS processing_count,
            MIN(CASE WHEN status = 'PENDING' THEN available_at ELSE NULL END) AS next_available_at
         FROM event_snapshot_tasks
         WHERE snapshot_run_id = ?`,
        [snapshotRunId]
    );
    return rows[0];
};

const cancel_active_snapshot_runs_for_event = async (connection, eventId, completedAt) => {
    const activeRuns = await list_active_snapshot_runs(connection, eventId);
    const cancellableRuns = activeRuns.filter(run => run.snapshot_type !== 'FINAL');

    for (const snapshotRun of cancellableRuns) {
        await connection.query(
            `UPDATE event_snapshot_tasks
             SET status = 'FAILED',
                 completed_at = ?,
                 last_attempt_at = ?,
                 claim_token = NULL,
                 failure_code = ?,
                 failure_message = ?
             WHERE snapshot_run_id = ? AND status IN (?, ?)`,
            [
                completedAt,
                completedAt,
                'EVENT_END_CANCELLED',
                'Snapshot run cancelled because the event was ended.',
                snapshotRun.id,
                'PENDING',
                'PROCESSING',
            ]
        );

        const counts = await get_snapshot_run_counts(connection, snapshotRun.id);
        await update_snapshot_run_progress(connection, snapshotRun.id, {
            status: 'COMPLETED',
            nextBatchAt: completedAt,
            completedAt,
            succeededCount: Number(counts.succeeded_count || 0),
            failedCount: Number(counts.failed_count || 0),
            lastError: 'Cancelled by event end.',
        });
    }
};

const update_snapshot_run_progress = async (db, snapshotRunId, payload) => {
    await db.query(
        `UPDATE event_snapshot_runs
         SET status = ?, next_batch_at = ?, completed_at = ?, succeeded_count = ?, failed_count = ?, last_error = ?
         WHERE id = ?`,
        [
            payload.status,
            payload.nextBatchAt,
            payload.completedAt,
            payload.succeededCount,
            payload.failedCount,
            payload.lastError ?? null,
            snapshotRunId,
        ]
    );
};

const get_latest_snapshot_run_by_type = async (db, eventId, snapshotType) => {
    const [rows] = await db.query(
        `SELECT * FROM event_snapshot_runs
         WHERE event_id = ? AND snapshot_type = ?
         ORDER BY started_at DESC, id DESC
         LIMIT 1`,
        [eventId, snapshotType]
    );
    return rows[0] || null;
};

const get_latest_hourly_snapshot_boundary = now => {
    return (
        Math.floor((now - EVENT_HOURLY_SNAPSHOT_OFFSET_MS) / EVENT_HOURLY_SNAPSHOT_INTERVAL_MS) *
        EVENT_HOURLY_SNAPSHOT_INTERVAL_MS
    ) + EVENT_HOURLY_SNAPSHOT_OFFSET_MS;
};

const should_create_hourly_snapshot = (eventRecord, latestHourlyRun, now) => {
    if (!eventRecord || eventRecord.status !== 'RUNNING' || !eventRecord.started_at) {
        return false;
    }

    const latestBoundary = get_latest_hourly_snapshot_boundary(now);
    if (now < latestBoundary || latestBoundary < eventRecord.started_at) {
        return false;
    }

    if (!latestHourlyRun) {
        return true;
    }

    return latestHourlyRun.started_at < latestBoundary;
};

const build_snapshot_retry_delay = retryDetails => {
    if (typeof retryDetails === 'number') {
        if (retryDetails <= 0) {
            return EVENT_SNAPSHOT_BATCH_DELAY_MS;
        }
        return Math.max(retryDetails, EVENT_SNAPSHOT_BATCH_DELAY_MS);
    }

    const retryAfterMs = retryDetails?.retryAfterMs ?? retryDetails?.rateLimit?.retryAfterMs ?? null;
    const resetAfterMs = retryDetails?.resetAfterMs ?? retryDetails?.rateLimit?.resetAfterMs ?? null;
    const candidateDelayMs = [retryAfterMs, resetAfterMs]
        .filter(value => Number.isFinite(value) && value > 0)
        .reduce((largest, value) => Math.max(largest, value), 0);

    if (!candidateDelayMs) {
        return EVENT_SNAPSHOT_BATCH_DELAY_MS;
    }
    return Math.max(candidateDelayMs, EVENT_SNAPSHOT_BATCH_DELAY_MS);
};

const finalize_snapshot_run_if_finished = async (db, client, snapshotRun) => {
    const counts = await get_snapshot_run_counts(db, snapshotRun.id);
    const pendingCount = Number(counts.pending_count || 0);
    const processingCount = Number(counts.processing_count || 0);
    const succeededCount = Number(counts.succeeded_count || 0);
    const failedCount = Number(counts.failed_count || 0);

    if (pendingCount === 0 && processingCount === 0) {
        const completedAt = Date.now();
        await update_snapshot_run_progress(db, snapshotRun.id, {
            status: 'COMPLETED',
            nextBatchAt: completedAt,
            completedAt,
            succeededCount,
            failedCount,
        });

        await send_log_message(
            client,
            `Snapshot run completed: run=${snapshotRun.id} type=${snapshotRun.snapshot_type} succeeded=${succeededCount} failed=${failedCount}`
        );

        if (snapshotRun.snapshot_type === 'FINAL') {
            await update_event_status(db, snapshotRun.event_id, {
                status: 'ENDED',
                is_active: 0,
                ended_at: completedAt,
            });
            await send_log_message(
                client,
                `Vanguard event ${snapshotRun.event_id} finalized at <t:${Math.floor(completedAt / 1000)}:F>.`
            );
        }

        return true;
    }

    const nextBatchAt = counts.next_available_at
        ? Number(counts.next_available_at)
        : Date.now() + EVENT_SNAPSHOT_BATCH_DELAY_MS;

    await update_snapshot_run_progress(db, snapshotRun.id, {
        status: 'PROCESSING',
        nextBatchAt,
        completedAt: null,
        succeededCount,
        failedCount,
    });

    return false;
};

const process_snapshot_run_batch = async (db, client, snapshotRun, fetchCorpseCount = get_event_counts) => {
    const claimToken = `${snapshotRun.id}_${Date.now()}`;
    const claimedTasks = await claim_snapshot_tasks(
        db,
        snapshotRun.id,
        snapshotRun.batch_size || EVENT_SNAPSHOT_BATCH_SIZE,
        Date.now(),
        claimToken
    );

    if (!claimedTasks.length) {
        await finalize_snapshot_run_if_finished(db, client, snapshotRun);
        return;
    }

    for (const task of claimedTasks) {
        const lookupResult = await fetchCorpseCount(task.minecraft_uuid, { profileId: task.profile_id ?? null });
        const nextAttempt = Number(task.attempt_count || 0) + 1;

        if (lookupResult.ok) {
            await mark_snapshot_task_succeeded(db, {
                taskId: task.id,
                snapshotRunId: snapshotRun.id,
                eventId: snapshotRun.event_id,
                participantId: task.participant_id,
                snapshotType: snapshotRun.snapshot_type,
                corpseCount: lookupResult.count,
                overallCorpseCount: lookupResult.overallCorpseCount,
                glacitePowder: lookupResult.glacitePowder,
                lapisCorpseCount: lookupResult.lapisCorpseCount,
                tungstenCorpseCount: lookupResult.tungstenCorpseCount,
                umberCorpseCount: lookupResult.umberCorpseCount,
                glacitePowderAvailable: lookupResult.glacitePowderAvailable,
                glacitePowderSpent: lookupResult.glacitePowderSpent,
                capturedAt: lookupResult.capturedAt,
            });
            continue;
        }

        const reachedMaxAttempts = nextAttempt >= EVENT_HYPIXEL_MAX_ATTEMPTS;
        if (lookupResult.failureCode === 'HYPIXEL_RATE_LIMITED' && !reachedMaxAttempts) {
            const retryDelayMs = build_snapshot_retry_delay(lookupResult);
            await mark_snapshot_task_for_retry(db, {
                taskId: task.id,
                availableAt: Date.now() + retryDelayMs,
                failureCode: lookupResult.failureCode,
                failureMessage: lookupResult.message,
                lastAttemptAt: Date.now(),
            });
            continue;
        }

        if (lookupResult.retryable && !reachedMaxAttempts) {
            await mark_snapshot_task_for_retry(db, {
                taskId: task.id,
                availableAt: Date.now() + EVENT_SNAPSHOT_BATCH_DELAY_MS,
                failureCode: lookupResult.failureCode,
                failureMessage: lookupResult.message,
                lastAttemptAt: Date.now(),
            });
            continue;
        }

        await mark_snapshot_task_failed(db, {
            taskId: task.id,
            completedAt: Date.now(),
            failureCode: lookupResult.failureCode,
            failureMessage: lookupResult.message,
        });
    }

    const counts = await get_snapshot_run_counts(db, snapshotRun.id);
    await update_snapshot_run_progress(db, snapshotRun.id, {
        status: 'PROCESSING',
        nextBatchAt: counts.next_available_at ? Math.max(Number(counts.next_available_at), Date.now() + EVENT_SNAPSHOT_BATCH_DELAY_MS) : Date.now(),
        completedAt: null,
        succeededCount: Number(counts.succeeded_count || 0),
        failedCount: Number(counts.failed_count || 0),
    });

    await finalize_snapshot_run_if_finished(db, client, snapshotRun);
};
const create_hourly_snapshots_if_needed = async (db, client) => {
    const eventRecord = await get_current_leaderboard_event(db);
    if (!eventRecord || eventRecord.status !== 'RUNNING') {
        return null;
    }

    const activeRunExists = await has_active_snapshot_run(db, eventRecord.id);
    if (activeRunExists) {
        return null;
    }

    const latestHourlyRun = await get_latest_snapshot_run_by_type(db, eventRecord.id, 'HOURLY');
    const now = Date.now();
    if (!should_create_hourly_snapshot(eventRecord, latestHourlyRun, now)) {
        return null;
    }

    const result = await create_snapshot_run_with_tasks(db, {
        eventId: eventRecord.id,
        snapshotType: 'HOURLY',
        batchSize: EVENT_SNAPSHOT_BATCH_SIZE,
        batchDelayMs: EVENT_SNAPSHOT_BATCH_DELAY_MS,
        startedAt: now,
        allowExisting: true,
    });

    if (result.created) {
        await send_log_message(client, `Hourly snapshot run started: run=${result.run.id} participants=${result.participantCount}`);
    }

    return result;
};

const tick_event_snapshot_processor = async (db, client, options = {}) => {
    const fetchCorpseCount = options.fetchCorpseCount || get_event_counts;
    const now = Date.now();
    await release_stale_processing_tasks(db, now - EVENT_SNAPSHOT_CLAIM_TIMEOUT_MS, now);
    await create_hourly_snapshots_if_needed(db, client);

    const readyRuns = await list_ready_snapshot_runs(db, Date.now());
    for (const snapshotRun of readyRuns) {
        await process_snapshot_run_batch(db, client, snapshotRun, fetchCorpseCount);
    }
};

const get_event_leaderboard_rows = async (db, eventId) => {
    const participants = await list_event_participants(db, eventId);
    const [snapshotRows] = await db.query(
        `SELECT participant_id, snapshot_type, corpse_count, overall_corpse_count, glacite_powder, captured_at
         FROM event_snapshots
         WHERE event_id = ?
         ORDER BY participant_id ASC, captured_at ASC, id ASC`,
        [eventId]
    );

    const snapshotsByParticipantId = new Map();
    for (const snapshot of snapshotRows) {
        if (!snapshotsByParticipantId.has(snapshot.participant_id)) {
            snapshotsByParticipantId.set(snapshot.participant_id, []);
        }
        snapshotsByParticipantId.get(snapshot.participant_id).push(snapshot);
    }

    return participants.map(participant => {
        const participantSnapshots = snapshotsByParticipantId.get(participant.id) || [];
        const baselineSnapshot = participantSnapshots[0] || null;
        const latestSnapshot = participantSnapshots[participantSnapshots.length - 1] || null;
        const finalSnapshots = participantSnapshots.filter(snapshot => snapshot.snapshot_type === 'FINAL');
        const finalSnapshot = finalSnapshots[finalSnapshots.length - 1] || null;

        return {
            id: participant.id,
            minecraft_uuid: participant.minecraft_uuid,
            minecraft_username: participant.minecraft_username,
            baseline_corpse_count: baselineSnapshot?.corpse_count ?? null,
            baseline_snapshot_type: baselineSnapshot?.snapshot_type ?? null,
            ...Object.fromEntries(['overall_corpse_count', 'glacite_powder'].flatMap(metric => [
                [`baseline_${metric}`, baselineSnapshot?.[metric] ?? null],
                [`latest_${metric}`, latestSnapshot?.[metric] ?? null],
                [`final_${metric}`, finalSnapshot?.[metric] ?? null],
            ])),
            final_corpse_count: finalSnapshot?.corpse_count ?? null,
            latest_corpse_count: latestSnapshot?.corpse_count ?? null,
            latest_captured_at: latestSnapshot?.captured_at ?? null,
        };
    });
};

const build_leaderboard_entries = (eventRecord, participantRows, metric = 'corpse_count') => {
    const entries = participantRows.map(row => {
        const displayName = row.minecraft_username || row.minecraft_uuid;
        const hasBaselineSnapshot = row[`baseline_${metric}`] !== null && row[`baseline_${metric}`] !== undefined;

        if (!hasBaselineSnapshot) {
            return { displayName, score: null, state: row.baseline_snapshot_type ? 'UNAVAILABLE' : 'PENDING', note: null };
        }

        const finalValueExists = row[`final_${metric}`] !== null && row[`final_${metric}`] !== undefined;
        const currentValue = eventRecord.status === 'ENDED' && finalValueExists
            ? row[`final_${metric}`]
            : row[`latest_${metric}`];

        if (currentValue === null || currentValue === undefined) {
            return { displayName, score: null, state: 'UNAVAILABLE', note: null };
        }

        const finalFailed = eventRecord.status === 'ENDED' && !finalValueExists && row.latest_captured_at !== null;
        return {
            displayName,
            score: currentValue - row[`baseline_${metric}`],
            state: 'OK',
            note: finalFailed ? 'latest snapshot used; final failed' : null,
        };
    });

    entries.sort((left, right) => {
        if (left.score === null && right.score === null) {
            return left.displayName.localeCompare(right.displayName);
        }
        if (left.score === null) {
            return 1;
        }
        if (right.score === null) {
            return -1;
        }
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        return left.displayName.localeCompare(right.displayName);
    });

    return entries;
};
const format_signed_gain = value => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toLocaleString()}`;
};

const build_leaderboard_rows = entries => {
    if (!entries.length) {
        return ['No participants have signed up yet.\n'];
    }

    return entries.map((entry, index) => {
        if (entry.state === 'PENDING') {
            return `${index + 1}\\. \`${entry.displayName}\` - Pending\n`;
        }
        if (entry.state === 'UNAVAILABLE') {
            return `${index + 1}\\. \`${entry.displayName}\` - Unavailable\n`;
        }

        const suffix = entry.note ? ` (${entry.note})` : '';
        return `${index + 1}\\. \`${entry.displayName}\` - ${format_signed_gain(entry.score)}${suffix}\n`;
    });
};

const get_leaderboard_payload_for_event = async (db, eventRecord) => {
    if (!eventRecord) {
        return { ok: false, message: 'There is no Vanguard event to display yet.' };
    }

    const rows = await get_event_leaderboard_rows(db, eventRecord.id);
    const leaderboards = [
        ['corpse_count', 'Vanguard Corpses'],
        ['overall_corpse_count', 'Overall Corpses'],
        ['glacite_powder', 'Glacite Powder'],
    ].map(([metric, label]) => {
        const entries = build_leaderboard_entries(eventRecord, rows, metric);
        return { metric, label, entries, rows: build_leaderboard_rows(entries) };
    });
    const entries = leaderboards[0].entries;
    return {
        ok: true,
        event: eventRecord,
        entries,
        leaderboards,
        rows: leaderboards[0].rows,
    };
};

const get_leaderboard_payload = async db => {
    const eventRecord = await get_current_leaderboard_event(db);
    return get_leaderboard_payload_for_event(db, eventRecord);
};

const get_leaderboard_payload_by_event_id = async (db, eventId) => {
    const eventRecord = await get_event_by_id(db, eventId);
    return get_leaderboard_payload_for_event(db, eventRecord);
};

const build_event_leaderboard_button_custom_id = (direction, eventId, page) => {
    return `${EVENT_LEADERBOARD_BUTTON_PREFIX}${direction}:${eventId}:${page}`;
};

const parse_event_leaderboard_button_custom_id = customId => {
    if (!customId.startsWith(EVENT_LEADERBOARD_BUTTON_PREFIX)) {
        return null;
    }

    const payload = customId.slice(EVENT_LEADERBOARD_BUTTON_PREFIX.length);
    const [direction, rawEventId, rawPage] = payload.split(':');
    const eventId = Number(rawEventId);
    const page = Number(rawPage);
    if (!direction || !Number.isInteger(eventId) || !Number.isInteger(page)) {
        return null;
    }

    return { direction, eventId, page };
};

const leaderboard_page_size = Math.min(EVENT_LEADERBOARD_PAGE_SIZE, 10);
const get_event_leaderboard_page_count = rows => {
    return Math.max(1, Math.ceil(rows.length / leaderboard_page_size));
};

const build_event_leaderboard_embed = payload => {
    const pageCount = get_event_leaderboard_page_count(payload.rows);
    const currentPage = Math.min(Math.max(payload.page || 0, 0), pageCount - 1);
    const pageRows = payload.rows.slice(
        currentPage * leaderboard_page_size,
        (currentPage + 1) * leaderboard_page_size
    );

    const embed = new EmbedBuilder()
        .setTitle(payload.event.name)
        .setColor('#FFC3FF')
        .setFooter({ text: `Page ${currentPage + 1}/${pageCount}` })
        .setDescription(
            `${payload.event.status === 'ENDED' ? 'Final' : 'Current'} ${payload.label} leaderboard (gained)\n${pageRows.join('')}`
        );

    return { embed, currentPage, pageCount };
};

const build_event_leaderboard_embeds = payload => {
    const boards = payload.leaderboards.map(board => build_event_leaderboard_embed({ ...payload, ...board }));
    return { embeds: boards.map(board => board.embed), currentPage: boards[0].currentPage, pageCount: boards[0].pageCount };
};

const build_event_leaderboard_components = (eventId, currentPage, pageCount) => {
    if (pageCount <= 1) {
        return [];
    }

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(build_event_leaderboard_button_custom_id('previous', eventId, currentPage))
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(build_event_leaderboard_button_custom_id('next', eventId, currentPage))
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
        ),
    ];
};

const handle_event_leaderboard_button = async (interaction, db) => {
    const parsed = parse_event_leaderboard_button_custom_id(interaction.customId);
    if (!parsed) {
        return false;
    }

    const payload = await get_leaderboard_payload_by_event_id(db, parsed.eventId);
    if (!payload.ok) {
        await interaction.update({ content: payload.message, embeds: [], components: [] });
        return true;
    }

    const pageCount = get_event_leaderboard_page_count(payload.rows);
    let nextPage = parsed.page;
    if (parsed.direction === 'previous') {
        nextPage = parsed.page > 0 ? parsed.page - 1 : pageCount - 1;
    } else if (parsed.direction === 'next') {
        nextPage = parsed.page + 1 < pageCount ? parsed.page + 1 : 0;
    }

    const { embeds, currentPage } = build_event_leaderboard_embeds({ ...payload, page: nextPage });
    const components = build_event_leaderboard_components(payload.event.id, currentPage, pageCount);
    await interaction.update({ embeds, components });
    return true;
};

const signup_for_current_event = async (db, discordUserId, fetchCorpseCount = get_event_counts, options = {}) => {
    const signupFetchLimiter = options.signupFetchLimiter || signup_hypixel_lookup_limiter;
    const now = Date.now();
    const eventRecord = await get_signup_event(db);

    if (!eventRecord) {
        return { ok: false, message: 'There is no active Vanguard event. Wait for a moderator to create one first.' };
    }

    if (eventRecord.status === 'ENDING') {
        return { ok: false, message: 'Signup is closed because the current Vanguard event has already started.' };
    }
    if (eventRecord.status === 'ENDED') {
        return { ok: false, message: 'The current Vanguard event has already ended.' };
    }

    const linkedAccount = await get_linked_minecraft_account(db, discordUserId);
    if (!linkedAccount?.uuid) {
        return { ok: false, message: 'You do not have a linked Minecraft account. Use `/verify` first.' };
    }

    const existingParticipant = await get_event_participant_by_discord_id(db, eventRecord.id, discordUserId);
    if (existingParticipant) {
        return { ok: false, message: 'You are already signed up for the current Vanguard event.' };
    }

    const existingMinecraftParticipant = await get_event_participant_by_minecraft_uuid(db, eventRecord.id, linkedAccount.uuid);
    if (existingMinecraftParticipant) {
        return { ok: false, message: 'That linked Minecraft account is already signed up for the current Vanguard event.' };
    }

    const vanguardResult = await signupFetchLimiter(() => fetchCorpseCount(linkedAccount.uuid));
    if (!vanguardResult.ok) {
        return { ok: false, message: `Could not fetch your Vanguard Corpse data: ${vanguardResult.message}` };
    }

    return run_in_transaction(db, async connection => {
        const lockedEvent = await get_event_by_id_for_update(connection, eventRecord.id);
        if (!lockedEvent || SIGNUP_CLOSED_EVENT_STATUSES.includes(lockedEvent.status)) {
            return { ok: false, message: 'Signup is closed because the current Vanguard event is ending or has already ended.' };
        }
        if (!SIGNUP_OPEN_EVENT_STATUSES.includes(lockedEvent.status)) {
            return { ok: false, message: 'There is no Vanguard event currently accepting signups.' };
        }

        const duplicateDiscordParticipant = await get_event_participant_by_discord_id(connection, lockedEvent.id, discordUserId);
        if (duplicateDiscordParticipant) {
            return { ok: false, message: 'You are already signed up for the current Vanguard event.' };
        }

        const duplicateMinecraftParticipant = await get_event_participant_by_minecraft_uuid(connection, lockedEvent.id, linkedAccount.uuid);
        if (duplicateMinecraftParticipant) {
            return { ok: false, message: 'That linked Minecraft account is already signed up for the current Vanguard event.' };
        }

        const participant = await create_event_participant(connection, {
            eventId: lockedEvent.id,
            discordUserId,
            minecraftUuid: linkedAccount.uuid,
            minecraftUsername: linkedAccount.ign,
            profileId: vanguardResult.profileId,
            signupCorpseCount: vanguardResult.count,
            signupOverallCorpseCount: vanguardResult.overallCorpseCount,
            signupGlacitePowder: vanguardResult.glacitePowder,
            signupLapisCorpseCount: vanguardResult.lapisCorpseCount,
            signupTungstenCorpseCount: vanguardResult.tungstenCorpseCount,
            signupUmberCorpseCount: vanguardResult.umberCorpseCount,
            signupGlacitePowderAvailable: vanguardResult.glacitePowderAvailable,
            signupGlacitePowderSpent: vanguardResult.glacitePowderSpent,
            signupAt: now,
        });

        if (lockedEvent.status === 'RUNNING') {
            await create_initial_signup_snapshot(connection, {
                eventId: lockedEvent.id,
                participantId: participant.id,
                corpseCount: vanguardResult.count,
                overallCorpseCount: vanguardResult.overallCorpseCount,
                glacitePowder: vanguardResult.glacitePowder,
                lapisCorpseCount: vanguardResult.lapisCorpseCount,
                tungstenCorpseCount: vanguardResult.tungstenCorpseCount,
                umberCorpseCount: vanguardResult.umberCorpseCount,
                glacitePowderAvailable: vanguardResult.glacitePowderAvailable,
                glacitePowderSpent: vanguardResult.glacitePowderSpent,
                capturedAt: vanguardResult.capturedAt,
                startedAt: now,
            });
        }

        return { ok: true, event: lockedEvent, participant, vanguard: vanguardResult };
    });
};

const create_current_event = async db => {
    const now = Date.now();
    const existingActiveEvent = await get_active_event(db);
    if (existingActiveEvent) {
        return { ok: false, message: 'There is already an active Vanguard event.' };
    }

    const eventRecord = await create_signup_event(db, now);
    return { ok: true, event: eventRecord };
};

const handle_event_confirmation_button = async (interaction, db, client) => {
    const parsed = parse_event_confirm_custom_id(interaction.customId);
    if (!parsed) {
        return false;
    }

    if (interaction.user.id !== parsed.discordUserId) {
        await interaction.reply({ content: 'Only the moderator who requested this action can confirm it.', ephemeral: true });
        return true;
    }

    if (parsed.cancelled) {
        await interaction.update({ content: 'Event action cancelled.', components: [] });
        return true;
    }

    if (parsed.action === 'create') {
        const result = await create_current_event(db);
        if (!result.ok) {
            await interaction.update({ content: result.message, components: [] });
            return true;
        }

        await send_log_message(client, `Vanguard event created by <@${interaction.user.id}>. event=${result.event.id}`);
        await interaction.update({
            content: `Vanguard event created.\nEvent: \`${result.event.name}\`\nStatus: \`${result.event.status}\``,
            components: [],
        });
        return true;
    }

    if (parsed.action === 'end') {
        const activeEvent = await get_active_event(db);
        if (!activeEvent || activeEvent.id !== parsed.eventId) {
            await interaction.update({
                content: 'The active event changed before confirmation. Re-run `/event end` if you still want to end the current event.',
                components: [],
            });
            return true;
        }

        const result = await end_current_event(db);
        if (!result.ok) {
            await interaction.update({ content: result.message, components: [] });
            return true;
        }

        await send_log_message(client, `Vanguard event ending initiated by <@${interaction.user.id}>. event=${result.event.id} participants=${result.participantCount} run=${result.snapshotRun.id}`);
        await interaction.update({
            content: `Vanguard event end sequence started.\nParticipants: \`${result.participantCount}\`\nFINAL snapshot run: \`${result.snapshotRun.id}\`\nThe event will be marked ended after the final snapshot completes.`,
            components: [],
        });
        return true;
    }

    await interaction.reply({ content: 'Unknown event confirmation action.', ephemeral: true });
    return true;
};

const start_current_event = async db => {
    return run_in_transaction(db, async connection => {
        const eventRecord = await get_active_event_for_update(connection);
        if (!eventRecord || eventRecord.status !== 'SIGNUP') {
            return { ok: false, message: 'There is no Vanguard event currently in signup state.' };
        }

        if (await has_active_snapshot_run(connection, eventRecord.id)) {
            return { ok: false, message: 'A snapshot run is already active for this event.' };
        }

        const startedAt = Date.now();
        const { run, participantCount } = await create_snapshot_run_with_tasks_in_connection(connection, {
            eventId: eventRecord.id,
            snapshotType: 'START',
            batchSize: EVENT_SNAPSHOT_BATCH_SIZE,
            batchDelayMs: EVENT_SNAPSHOT_BATCH_DELAY_MS,
            startedAt,
            allowExisting: true,
        });

        const updatedEvent = await update_event_status(connection, eventRecord.id, {
            status: 'RUNNING',
            started_at: startedAt,
            ending_started_at: null,
            ended_at: null,
        });

        return { ok: true, event: updatedEvent, snapshotRun: run, participantCount };
    });
};

const end_current_event = async db => {
    return run_in_transaction(db, async connection => {
        const eventRecord = await get_active_event_for_update(connection);
        if (!eventRecord || eventRecord.status !== 'RUNNING') {
            return { ok: false, message: 'There is no Vanguard event currently running.' };
        }

        const endingStartedAt = Date.now();
        await cancel_active_snapshot_runs_for_event(connection, eventRecord.id, endingStartedAt);
        const { run, participantCount } = await create_snapshot_run_with_tasks_in_connection(connection, {
            eventId: eventRecord.id,
            snapshotType: 'FINAL',
            batchSize: EVENT_SNAPSHOT_BATCH_SIZE,
            batchDelayMs: EVENT_SNAPSHOT_BATCH_DELAY_MS,
            startedAt: endingStartedAt,
            allowExisting: true,
        });

        const eventFields = participantCount === 0
            ? {
                status: 'ENDED',
                is_active: 0,
                ending_started_at: endingStartedAt,
                ended_at: endingStartedAt,
            }
            : {
                status: 'ENDING',
                ending_started_at: endingStartedAt,
            };

        const updatedEvent = await update_event_status(connection, eventRecord.id, eventFields);
        return { ok: true, event: updatedEvent, snapshotRun: run, participantCount };
    });
};

const event_interaction = async (interaction, db, client) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'signup') {
        await interaction.deferReply({ ephemeral: true });
        const result = await signup_for_current_event(db, interaction.user.id);
        if (!result.ok) {
            await interaction.editReply(result.message);
            return;
        }

        await interaction.editReply(
            `Signed up for **${result.event.name}**.\n` +
            `Linked account: \`${result.participant.minecraft_username}\`\n` +
            `Current Vanguard Corpses: \`${result.vanguard.count}\`\n` +
            `Current Overall Corpses: \`${result.vanguard.overallCorpseCount}\`\n` +
            `Total Glacite Powder: \`${result.vanguard.glacitePowder}\`\n` +
            `Profile used: \`${result.vanguard.profileName}\` (${result.vanguard.selectionReason})`
        );
        return;
    }

    if (subcommand === 'leaderboard') {
        await interaction.deferReply({ ephemeral: false });
        const payload = await get_leaderboard_payload(db);
        if (!payload.ok) {
            await interaction.editReply(payload.message);
            return;
        }

        const { embeds, currentPage, pageCount } = build_event_leaderboard_embeds({ ...payload, page: 0 });
        await interaction.editReply({
            embeds,
            components: build_event_leaderboard_components(payload.event.id, currentPage, pageCount),
        });
        return;
    }

    if (!ensure_moderator_permissions(interaction)) {
        await interaction.reply({ content: 'You do not have permission to use this event subcommand.', ephemeral: true });
        return;
    }

    if (subcommand === 'create') {
        await interaction.deferReply({ ephemeral: true });
        if (!has_valid_event_password(interaction)) {
            await interaction.editReply('Incorrect password.');
            return;
        }

        await interaction.editReply({
            content: 'Confirm creating a new Vanguard event.',
            components: build_event_confirmation_buttons(
                build_event_confirm_custom_id('create', interaction.user.id)
            ),
        });
        return;
    }

    if (subcommand === 'start') {
        await interaction.deferReply({ ephemeral: true });
        const result = await start_current_event(db);
        if (!result.ok) {
            await interaction.editReply(result.message);
            return;
        }

        await send_log_message(client, `Vanguard event started by <@${interaction.user.id}>. event=${result.event.id} participants=${result.participantCount} run=${result.snapshotRun.id}`);
        await interaction.editReply(`Vanguard event started.\nParticipants: \`${result.participantCount}\`\nSTART snapshot run: \`${result.snapshotRun.id}\``);
        return;
    }

    if (subcommand === 'end') {
        await interaction.deferReply({ ephemeral: true });
        if (!has_valid_event_password(interaction)) {
            await interaction.editReply('Incorrect password.');
            return;
        }

        const activeEvent = await get_active_event(db);
        if (!activeEvent || activeEvent.status !== 'RUNNING') {
            await interaction.editReply('There is no Vanguard event currently running.');
            return;
        }

        await interaction.editReply({
            content: `Confirm ending Vanguard event \`${activeEvent.name}\` (\`${activeEvent.id}\`).`,
            components: build_event_confirmation_buttons(
                build_event_confirm_custom_id('end', interaction.user.id, activeEvent.id)
            ),
        });
    }
};

const create_event_processor_runner = processor => {
    let running = false;
    return async (...args) => {
        if (running) {
            return false;
        }

        running = true;
        try {
            await processor(...args);
            return true;
        } finally {
            running = false;
        }
    };
};

module.exports = {
    event_command,
    event_interaction,
    handle_event_confirmation_button,
    handle_event_leaderboard_button,
    tick_event_snapshot_processor,
    EVENT_SNAPSHOT_TICK_MS,
    EVENT_HYPIXEL_MAX_ATTEMPTS,
    should_create_hourly_snapshot,
    build_snapshot_retry_delay,
    build_leaderboard_entries,
    build_event_leaderboard_embeds,
    insert_event_snapshot,
    signup_for_current_event,
    create_hourly_snapshots_if_needed,
    process_snapshot_run_batch,
    end_current_event,
    start_current_event,
    create_current_event,
    get_event_leaderboard_rows,
    get_leaderboard_payload_by_event_id,
    create_concurrency_limiter,
    create_event_processor_runner,
};


