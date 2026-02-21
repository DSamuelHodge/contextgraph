export function estimateTokens(s: string) {
  // conservative heuristic: 1 token ≈ 4 chars (rough LLM heuristic)
  return Math.ceil(s.length / 4)
}
