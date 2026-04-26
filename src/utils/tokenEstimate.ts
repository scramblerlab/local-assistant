// Rough token estimator. CJK characters are ~1 token each; Latin ~4 chars/token.
// We use 3.5 chars/token as a conservative average that handles mixed text well.
const CHARS_PER_TOKEN = 3.5;
const PER_MESSAGE_OVERHEAD = 4; // role + structural tokens

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(role: string, content: string): number {
  return PER_MESSAGE_OVERHEAD + estimateTokens(role) + estimateTokens(content);
}
