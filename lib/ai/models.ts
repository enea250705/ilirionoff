export const DEFAULT_CHAT_MODEL: string = 'chat-model';

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'DeepSeek',
    description: 'Modeli kryesor për bisedë të përgjithshme',
  },
  {
    id: 'chat-model-reasoning',
    name: 'DeepSeek Reasoning',
    description: 'Përdor arsyetim të avancuar',
  },
  {
    id: 'xai-model',
    name: 'Grok AI',
    description: 'Model alternativ me aftësi të avancuara',
  },
  {
    id: 'groq-model',
    name: 'Llama 3',
    description: 'Model i shpejtë dhe efikas',
  },
  {
    id: 'artifact-model',
    name: 'DeepSeek Coder',
    description: 'I specializuar për programim dhe kod',
  },
];
