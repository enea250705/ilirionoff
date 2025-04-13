import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

// Use environment variables for API keys
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-1234567890'; // Fallback to a placeholder API key for testing

// Create a custom language model for DeepSeek integration
const createDeepSeekModel = (modelName: string) => {
  return {
    // These properties are required by the AI SDK
    specificationVersion: 'v1' as const,
    provider: 'deepseek',
    modelId: `deepseek-${modelName}`,
    defaultObjectGenerationMode: 'json' as const,
    objectGenerationMode: 'json' as const,
    
    // Implementation for non-streaming requests
    doGenerate: async ({ messages, temperature = 0.7, maxTokens }: any) => {
      console.log(`[DEEPSEEK] Using model ${modelName} with ${messages.length} messages`);
      
      // Format the system prompt for Albanian language support
      const formattedMessages = messages.map((m: any) => {
        if (m.role === 'system') {
          return {
            ...m,
            content: `${m.content}\n\n[SPECIAL INSTRUCTIONS] You are Ilirion AI, an Albanian-exclusive assistant. You MUST respond ONLY in Albanian language.`
          };
        }
        return m;
      });
      
      try {
        // Call the DeepSeek API directly - using proper model version
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName === 'chat' ? 'deepseek-chat' : 'deepseek-coder',
            messages: formattedMessages,
            temperature,
            max_tokens: maxTokens || 2048,
            timeout: 60000 // 60 second timeout to prevent hanging requests
          })
        });
        
        if (!response.ok) {
          console.error(`[DEEPSEEK] API error status: ${response.status}`);
          // Only try to parse JSON if the response has content
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorData = JSON.parse(errorText);
              console.error("[DEEPSEEK] API error details:", errorData);
            } catch (e) {
              console.error("[DEEPSEEK] API error (raw):", errorText);
            }
          }
          throw new Error(`DeepSeek API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        return {
          text: data.choices[0].message.content,
          finishReason: data.choices[0].finish_reason || 'stop',
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
          },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      } catch (error) {
        console.error("[DEEPSEEK] Error:", error);
        // Return a simple response in Albanian
        return {
          text: "Më vjen keq, pati një problem teknik. Ju lutem, provoni përsëri.",
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }
    },
    
    // Implementation for streaming requests
    doStream: async ({ messages, temperature = 0.7, maxTokens }: any) => {
      console.log(`[DEEPSEEK] Streaming with model ${modelName} with ${messages.length} messages`);
      
      // Format the system prompt for Albanian language support
      const formattedMessages = messages.map((m: any) => {
        if (m.role === 'system') {
          return {
            ...m,
            content: `${m.content}\n\n[SPECIAL INSTRUCTIONS] You are Ilirion AI, an Albanian-exclusive assistant. You MUST respond ONLY in Albanian language.`
          };
        }
        return m;
      });
      
      try {
        // Call the DeepSeek API with streaming
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName === 'chat' ? 'deepseek-chat' : 'deepseek-coder',
            messages: formattedMessages,
            temperature,
            max_tokens: maxTokens || 2048,
            timeout: 60000, // 60 second timeout
            stream: true
          })
        });
        
        if (!response.ok) {
          console.error(`[DEEPSEEK] Streaming API error status: ${response.status}`);
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorData = JSON.parse(errorText);
              console.error("[DEEPSEEK] Streaming API error details:", errorData);
            } catch (e) {
              console.error("[DEEPSEEK] Streaming API error (raw):", errorText);
            }
          }
          throw new Error(`DeepSeek API streaming error: ${response.status}`);
        }
        
        // Create a TransformStream to process the streamed response
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        
        let streamingText = '';
        let finishReason = 'stop';
        let promptTokens = 0;
        let completionTokens = 0;
        
        const transformStream = new TransformStream({
          async transform(chunk, controller) {
            const text = decoder.decode(chunk);
            
            // Skip empty lines and [DONE] messages
            if (!text.trim() || text.includes('[DONE]')) return;
            
            // Parse the SSE data
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.choices && data.choices.length > 0) {
                    const delta = data.choices[0].delta;
                    
                    if (delta && delta.content) {
                      streamingText += delta.content;
                      
                      // Send text delta
                      controller.enqueue(encoder.encode(JSON.stringify({
                        type: 'text-delta',
                        textDelta: delta.content
                      }) + '\n'));
                    }
                    
                    if (data.choices[0].finish_reason) {
                      finishReason = data.choices[0].finish_reason;
                    }
                  }
                  
                  if (data.usage) {
                    promptTokens = data.usage.prompt_tokens || 0;
                    completionTokens = data.usage.completion_tokens || 0;
                  }
                } catch (error) {
                  console.error('[DEEPSEEK] Error parsing SSE:', error);
                }
              }
            }
          },
          
          flush(controller) {
            // Send finish message at the end
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'finish',
              finishReason,
              usage: {
                promptTokens,
                completionTokens
              }
            }) + '\n'));
          }
        });
        
        // Create the readable stream from the response
        const stream = response.body
          ?.pipeThrough(transformStream)
          .getReader();
        
        if (!stream) {
          throw new Error('Failed to create stream from DeepSeek API response');
        }
        
        // Create a readable stream that the AI SDK can consume
        const readableStream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await stream.read();
            
            if (done) {
              controller.close();
            } else {
              controller.enqueue(value);
            }
          },
          cancel() {
            stream.cancel();
          },
        });
        
        return {
          stream: readableStream,
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      } catch (error) {
        console.error("[DEEPSEEK] Streaming error:", error);
        
        // Create a stream with an error message in Albanian
        const encoder = new TextEncoder();
        const errorStream = new ReadableStream({
          start(controller) {
            // Send error message
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'text-delta',
              textDelta: "Më vjen keq, pati një problem teknik me streamin. Ju lutem, provoni përsëri."
            }) + '\n'));
            
            // Send finish message
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'finish',
              finishReason: 'error',
              usage: {
                promptTokens: 0,
                completionTokens: 0
              }
            }) + '\n'));
            
            controller.close();
          },
        });
        
        return {
          stream: errorStream,
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }
    }
  };
};

// Create a lightweight title model that works without API calls
const createSimpleTitleModel = () => {
  const model = {
    specificationVersion: 'v1' as const,
    provider: 'local',
    modelId: 'simple-title-model',
    defaultObjectGenerationMode: 'json' as const,
    objectGenerationMode: 'json' as const,
    
    doGenerate: async ({ messages }: any) => {
      // Get last user message
      const userMessage = messages.filter((m: any) => m.role === 'user').pop();
      const content = userMessage?.content || '';
      const text = typeof content === 'string' ? content : JSON.stringify(content);
      
      // Generate a simple title
      let title = text.slice(0, 30);
      if (text.length > 30) title += '...';
      
      // Add Albanian context
      if (text.includes('?')) {
        title = `Pyetje: ${title}`;
      } else if (text.toLowerCase().includes('përshëndetje') || 
                text.toLowerCase().includes('pershendetje') || 
                text.toLowerCase().includes('tungjatjeta')) {
        title = 'Bisedë e re';
      }
      
      return {
        text: title,
        finishReason: 'stop' as const,
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
    
    // Simple stream implementation that just returns the text
    doStream: async ({ messages }: any) => {
      // Generate the title directly instead of calling this.doGenerate
      const userMessage = messages.filter((m: any) => m.role === 'user').pop();
      const content = userMessage?.content || '';
      const text = typeof content === 'string' ? content : JSON.stringify(content);
      
      let title = text.slice(0, 30);
      if (text.length > 30) title += '...';
      
      if (text.includes('?')) {
        title = `Pyetje: ${title}`;
      } else if (text.toLowerCase().includes('përshëndetje') || 
                text.toLowerCase().includes('pershendetje') || 
                text.toLowerCase().includes('tungjatjeta')) {
        title = 'Bisedë e re';
      }
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'text-delta',
            textDelta: title
          }) + '\n'));
          
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'finish',
            finishReason: 'stop',
            usage: { promptTokens: 0, completionTokens: 0 }
          }) + '\n'));
          
          controller.close();
        }
      });
      
      return {
        stream,
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    }
  };
  
  return model;
};

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      }
    })
  : customProvider({
      languageModels: {
        // Primary model: DeepSeek (simulated with Albanian language support)
        'chat-model': createDeepSeekModel('chat'),
        'chat-model-reasoning': wrapLanguageModel({
          model: createDeepSeekModel('chat'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': createSimpleTitleModel(),
        'artifact-model': createDeepSeekModel('coder'),
        
        // Same models for different menu selections (all use DeepSeek simulation)
        'xai-model': createDeepSeekModel('chat'),
        'groq-model': createDeepSeekModel('chat'),
      }
    });
