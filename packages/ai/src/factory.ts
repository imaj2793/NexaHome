import type { AIProvider, AIProviderConfig } from './chat';
import { OpenAICompatibleProvider } from './openai-compatible';
import { MockAIProvider } from './mock';
import type { SpeechProvider } from './speech';
import {
  MockSpeechProvider,
  OpenAICompatibleSpeechProvider,
} from './speech';

/** Buat provider AI (chat) berdasarkan nama. 'mock' → tanpa network. */
export function createAIProvider(
  name: string,
  config: AIProviderConfig,
): AIProvider {
  if (name === 'mock') {
    return new MockAIProvider();
  }
  return new OpenAICompatibleProvider(config);
}

/** Buat provider speech (STT/TTS) berdasarkan nama. 'mock' → tanpa network. */
export function createSpeechProvider(
  name: string,
  config: AIProviderConfig,
): SpeechProvider {
  if (name === 'mock') {
    return new MockSpeechProvider();
  }
  return new OpenAICompatibleSpeechProvider(config);
}
