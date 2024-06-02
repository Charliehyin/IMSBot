import json
import logging
from transformers import pipeline, AutoModelForSequenceClassification, AutoTokenizer

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Load model and tokenizer globally to avoid reloading on each invocation
model_name = "Hate-speech-CNERG/dehatebert-mono-english"
logger.info("Loading model and tokenizer...")
model = AutoModelForSequenceClassification.from_pretrained(model_name)
tokenizer = AutoTokenizer.from_pretrained(model_name)
nlp = pipeline("text-classification", model=model, tokenizer=tokenizer)
logger.info("Model and tokenizer loaded.")

def handler(event, context):
    try:
        # Log the incoming event
        logger.info("Received event: " + json.dumps(event))

        # Extract the text from the event body
        if 'body' in event:
            body = json.loads(event['body'])
            text = body.get('text', '')
        else:
            # Direct Lambda test
            text = event.get('text', '')

        # Perform text classification
        result = nlp(text)[0]

        # Log the result
        logger.info("Classification result: " + json.dumps(result))

        # Create a response
        response = {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps(result)
        }
        return response

    except Exception as e:
        logger.error("Error processing event: " + str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
