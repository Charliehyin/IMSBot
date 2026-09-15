require('dotenv').config();

const { HYPIXEL_REQUEST_TIMEOUT_MS } = require('../constants');

const normalize_uuid = uuid => uuid.replace(/-/g, '').toLowerCase();

const extract_retry_after_ms = response => {
    const retryAfterHeader = response.headers.get('retry-after');
    if (!retryAfterHeader) {
        return null;
    }

    const asSeconds = Number.parseFloat(retryAfterHeader);
    if (Number.isFinite(asSeconds)) {
        return Math.max(0, Math.ceil(asSeconds * 1000));
    }

    const retryDate = Date.parse(retryAfterHeader);
    if (Number.isFinite(retryDate)) {
        return Math.max(0, retryDate - Date.now());
    }

    return null;
};

const parse_integer_header = (response, headerName) => {
    const rawValue = response.headers.get(headerName);
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return null;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
};

const extract_rate_limit_reset_ms = response => {
    const resetValue = parse_integer_header(response, 'ratelimit-reset');
    if (resetValue === null || resetValue < 0) {
        return null;
    }

    if (resetValue >= 1_000_000_000) {
        const resetAtMs = resetValue * 1000;
        return {
            resetAtMs,
            resetAfterMs: Math.max(0, resetAtMs - Date.now()),
        };
    }

    return {
        resetAtMs: Date.now() + (resetValue * 1000),
        resetAfterMs: resetValue * 1000,
    };
};

const extract_rate_limit_details = response => {
    const retryAfterMs = extract_retry_after_ms(response);
    const remaining = parse_integer_header(response, 'ratelimit-remaining');
    const reset = extract_rate_limit_reset_ms(response);

    return {
        retryAfterMs,
        remaining,
        resetAtMs: reset?.resetAtMs ?? null,
        resetAfterMs: reset?.resetAfterMs ?? null,
    };
};

const fetch_skyblock_profiles = async (uuid, apiKey = process.env.HYPIXEL_API_KEY, options = {}) => {
    const fetchImpl = options.fetchImpl || (await import('node-fetch')).default;
    const normalizedUuid = normalize_uuid(uuid);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HYPIXEL_REQUEST_TIMEOUT_MS);

    try {
        const response = await fetchImpl(
            `https://api.hypixel.net/v2/skyblock/profiles?uuid=${normalizedUuid}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'API-Key': apiKey,
                },
                signal: controller.signal,
            }
        );

        const rateLimit = extract_rate_limit_details(response);

        if (!response.ok) {
            let bodyText = '';
            try {
                bodyText = await response.text();
            } catch (error) {
                bodyText = error.message;
            }

            return {
                ok: false,
                status: response.status,
                retryAfterMs: rateLimit.retryAfterMs,
                rateLimit,
                failureCode: response.status === 429 ? 'HYPIXEL_RATE_LIMITED' : 'HYPIXEL_HTTP_ERROR',
                message: bodyText || `Hypixel request failed with status ${response.status}.`,
            };
        }

        const data = await response.json();
        if (!data.success) {
            return {
                ok: false,
                status: response.status,
                retryAfterMs: rateLimit.retryAfterMs,
                rateLimit,
                failureCode: 'HYPIXEL_API_FAILURE',
                message: data.cause || 'Hypixel API returned success=false.',
            };
        }

        return {
            ok: true,
            data,
        };
    } catch (error) {
        return {
            ok: false,
            failureCode: error.name === 'AbortError' ? 'HYPIXEL_TIMEOUT' : 'HYPIXEL_FETCH_ERROR',
            message: error.message,
        };
    } finally {
        clearTimeout(timeout);
    }
};

const get_profile_leveling_experience = (profile, normalizedUuid) => {
    return profile?.members?.[normalizedUuid]?.leveling?.experience ?? -1;
};

const get_profile_last_save = (profile, normalizedUuid) => {
    return profile?.members?.[normalizedUuid]?.last_save ?? profile?.created_at ?? 0;
};

const select_vanguard_ironman_profile = (profiles, uuid) => {
    const normalizedUuid = normalize_uuid(uuid);
    const ironmanProfiles = (profiles || []).filter(profile =>
        profile?.game_mode === 'ironman' && profile?.members?.[normalizedUuid]
    );

    if (!ironmanProfiles.length) {
        return null;
    }

    const sortedProfiles = [...ironmanProfiles].sort((left, right) => {
        const rightXp = get_profile_leveling_experience(right, normalizedUuid);
        const leftXp = get_profile_leveling_experience(left, normalizedUuid);
        if (rightXp !== leftXp) {
            return rightXp - leftXp;
        }

        const rightLastSave = get_profile_last_save(right, normalizedUuid);
        const leftLastSave = get_profile_last_save(left, normalizedUuid);
        return rightLastSave - leftLastSave || String(left.profile_id).localeCompare(String(right.profile_id));
    });

    return {
        profile: sortedProfiles[0],
        selectionReason: 'highest_ironman_xp',
    };
};

const select_preferred_skyblock_profile = (profiles, uuid) => {
    const normalizedUuid = normalize_uuid(uuid);
    const usableProfiles = (profiles || []).filter(profile => profile?.members?.[normalizedUuid]);

    if (!usableProfiles.length) {
        return null;
    }

    const selectedProfile = usableProfiles.find(profile => profile.selected === true);
    if (selectedProfile) {
        return {
            profile: selectedProfile,
            selectionReason: 'selected_flag',
        };
    }

    const ironmanProfiles = usableProfiles.filter(profile => profile.game_mode === 'ironman');
    const candidateProfiles = ironmanProfiles.length ? ironmanProfiles : usableProfiles;
    const sortedProfiles = [...candidateProfiles].sort((left, right) => {
        const rightXp = get_profile_leveling_experience(right, normalizedUuid);
        const leftXp = get_profile_leveling_experience(left, normalizedUuid);
        if (rightXp !== leftXp) {
            return rightXp - leftXp;
        }

        const rightLastSave = get_profile_last_save(right, normalizedUuid);
        const leftLastSave = get_profile_last_save(left, normalizedUuid);
        return rightLastSave - leftLastSave;
    });

    return {
        profile: sortedProfiles[0],
        selectionReason: ironmanProfiles.length ? 'highest_ironman_xp' : 'highest_profile_xp',
    };
};

const extract_vanguard_count_from_member = memberData => {
    return memberData?.glacite_player_data?.corpses_looted?.vanguard ?? 0;
};

const extract_event_counts_from_member = memberData => {
    const corpses = memberData?.glacite_player_data?.corpses_looted ?? {};
    const mining = memberData?.mining_core ?? {};
    const counter = value => {
        if (value === undefined || value === null) return 0;
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error('Invalid event counter in SkyBlock profile.');
        }
        return value;
    };
    return {
        count: counter(corpses.vanguard),
        lapisCorpseCount: counter(corpses.lapis),
        tungstenCorpseCount: counter(corpses.tungsten),
        umberCorpseCount: counter(corpses.umber),
        glacitePowderAvailable: counter(mining.powder_glacite),
        glacitePowderSpent: counter(mining.powder_spent_glacite),
        overallCorpseCount: counter(Object.values(corpses).reduce((sum, value) => sum + counter(value), 0)),
        glacitePowder: counter(mining.powder_glacite),
    };
};

const is_retryable_hypixel_failure = failureCode => {
    return [
        'HYPIXEL_RATE_LIMITED',
        'HYPIXEL_HTTP_ERROR',
        'HYPIXEL_TIMEOUT',
        'HYPIXEL_FETCH_ERROR',
        'HYPIXEL_API_FAILURE',
    ].includes(failureCode);
};

const get_event_counts = async (uuid, options = {}) => {
    const normalizedUuid = normalize_uuid(uuid);
    const profileResponse = await fetch_skyblock_profiles(normalizedUuid, process.env.HYPIXEL_API_KEY, options);

    if (!profileResponse.ok) {
        return {
            ok: false,
            failureCode: profileResponse.failureCode,
            message: profileResponse.message,
            retryAfterMs: profileResponse.retryAfterMs ?? null,
            rateLimit: profileResponse.rateLimit ?? null,
            retryable: is_retryable_hypixel_failure(profileResponse.failureCode),
        };
    }

    const profiles = Array.isArray(profileResponse.data.profiles) ? profileResponse.data.profiles : [];
    const savedProfile = options.profileId
        ? profiles.find(profile => profile?.profile_id === options.profileId
            && profile?.game_mode === 'ironman' && profile?.members?.[normalizedUuid])
        : null;
    if (options.profileId && !savedProfile) {
        return {
            ok: false,
            failureCode: 'MISSING_SAVED_IRONMAN_PROFILE',
            message: 'The saved event Ironman profile is unavailable for this player.',
            retryable: false,
        };
    }
    const selectedProfileResult = savedProfile
        ? { profile: savedProfile, selectionReason: 'saved_event_profile' }
        : select_vanguard_ironman_profile(profiles, normalizedUuid);
    if (!selectedProfileResult) {
        return {
            ok: false,
            failureCode: 'MISSING_IRONMAN_PROFILE',
            message: 'No valid Ironman SkyBlock profile was found for this player.',
            retryable: false,
        };
    }

    const memberData = selectedProfileResult.profile.members?.[normalizedUuid];
    if (!memberData) {
        return {
            ok: false,
            failureCode: 'MISSING_MEMBER_DATA',
            message: 'The selected SkyBlock profile did not contain member data for this player.',
            retryable: false,
        };
    }

    let counts;
    try {
        counts = extract_event_counts_from_member(memberData);
    } catch (error) {
        return { ok: false, failureCode: 'INVALID_EVENT_COUNTER', message: error.message, retryable: false };
    }
    return {
        ok: true,
        minecraftUuid: normalizedUuid,
        ...counts,
        capturedAt: Date.now(),
        profileId: selectedProfileResult.profile.profile_id,
        profileName: selectedProfileResult.profile.cute_name || selectedProfileResult.profile.profile_id,
        profileGameMode: selectedProfileResult.profile.game_mode || 'normal',
        selectionReason: selectedProfileResult.selectionReason,
    };
};

const get_ironman_skyblock_xp = async uuid => {
    const normalizedUuid = normalize_uuid(uuid);
    const response = await fetch_skyblock_profiles(normalizedUuid);

    if (!response.ok) {
        return -1;
    }

    let highestXp = -1;
    for (const profile of response.data.profiles || []) {
        if (!profile?.members?.[normalizedUuid]) {
            continue;
        }
        if (profile.game_mode !== 'ironman') {
            continue;
        }
        highestXp = Math.max(highestXp, profile.members[normalizedUuid]?.leveling?.experience ?? -1);
    }

    return highestXp;
};

module.exports = {
    normalize_uuid,
    extract_rate_limit_details,
    fetch_skyblock_profiles,
    select_vanguard_ironman_profile,
    select_preferred_skyblock_profile,
    extract_vanguard_count_from_member,
    get_vanguard_corpse_count: get_event_counts,
    get_event_counts,
    extract_event_counts_from_member,
    is_retryable_hypixel_failure,
    get_ironman_skyblock_xp,
};

