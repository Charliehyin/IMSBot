from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import BertConfig, BertTokenizer, BertModel, BertPreTrainedModel
from torch import nn

# Define label mapping
label_mapping = {0: 'porn', 1: 'normal'}

path = r'C:\Users\Charlie Yin\Documents\IMSBot\IMSBot\src\model_api\NSFW-detector'

# Load custom model configuration and tokenizer
config = BertConfig.from_pretrained(path, num_labels=2, finetuning_task='text classification')
tokenizer = BertTokenizer.from_pretrained(path, use_fast=False, never_split=['[user]', '[chatbot]'])
tokenizer.vocab['[user]'] = tokenizer.vocab.pop('[unused1]')
tokenizer.vocab['[chatbot]'] = tokenizer.vocab.pop('[unused2]')

# Define custom BERT model for sequence classification
class BertForSequenceClassification(BertPreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.num_labels = config.num_labels
        self.config = config

        self.bert = BertModel.from_pretrained(path)
        classifier_dropout = (config.classifier_dropout if config.classifier_dropout is not None else config.hidden_dropout_prob)
        self.dropout = nn.Dropout(classifier_dropout)
        self.classifier = nn.Linear(config.hidden_size, config.num_labels)

        # Initialize weights and apply final processing
        self.post_init()

    def forward(self,
                input_ids: Optional[torch.Tensor] = None,
                attention_mask: Optional[torch.Tensor] = None,
                token_type_ids: Optional[torch.Tensor] = None,
                position_ids: Optional[torch.Tensor] = None,
                head_mask: Optional[torch.Tensor] = None,
                inputs_embeds: Optional[torch.Tensor] = None,
                labels: Optional[torch.Tensor] = None,
                output_attentions: Optional[bool] = None,
                output_hidden_states: Optional[bool] = None,
                return_dict: Optional[bool] = None):

        return_dict = return_dict if return_dict is not None else self.config.use_return_dict

        outputs = self.bert(
            input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            position_ids=position_ids,
            head_mask=head_mask,
            inputs_embeds=inputs_embeds,
            output_attentions=output_attentions,
            output_hidden_states=output_hidden_states,
            return_dict=return_dict,
        )

        # we use cls embedding
        cls = outputs[0][:, 0, :]
        cls = self.dropout(cls)
        logits = self.classifier(cls)

        return logits

# Load the model
model = BertForSequenceClassification(config=config)
model.load_state_dict(torch.load(path + '/pytorch_model.bin', map_location=torch.device('cpu')))
model.eval()

# Initialize FastAPI
app = FastAPI()

class TextInput(BaseModel):
    text: str

@app.post("/nsfw/")
async def classify_text(input: TextInput):
    try:
        # Prepare the text for the model
        text = input.text
        result = tokenizer.encode_plus(
            text=text,
            padding='max_length',
            max_length=512,
            truncation=True,
            add_special_tokens=True,
            return_token_type_ids=True,
            return_tensors='pt'
        )
        
        # Ensure the tensors are on the CPU
        result = {key: value.to('cpu') for key, value in result.items()}

        # Run the model
        with torch.no_grad():
            logits = model(**result)
            predictions = torch.nn.functional.softmax(logits, dim=-1)
            predicted_class_idx = predictions.argmax().item()
            confidence = predictions.max().item()
            predicted_class = label_mapping[predicted_class_idx]

        return {"class": predicted_class, "confidence": confidence}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)