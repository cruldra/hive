/**
 * Utility functions for the Hive-side permission auto-approve system.
 *
 * Used by the OpenCode backend permission prompt (PermissionPrompt.tsx) to:
 *  1. Split bash && chains into individual sub-commands for display
 *  2. Auto-approve permission requests that match patterns in the commandFilter allowlist
 *
 * The commandFilter.allowlist (from useSettingsStore) is shared between the Claude SDK
 * command approval system and the OpenCode permission prompt system.
 * Pattern format: "toolName: command" e.g. "bash: npm *", "edit: src/**"
 */

/**
 * Split a bash command string by && / || / ; into individual sub-commands.
 * Returns trimmed, non-empty parts.
 *
 * @example
 * splitBashCommand('git add . && git commit -m "fix"')
 * // → ['git add .', 'git commit -m "fix"']
 */
export function splitBashCommand(cmd: string): string[] {
  return cmd
    .split(/\s*&&\s*|\s*\|\|\s*|\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Test whether a prefixed command (e.g. "bash: npm install") matches a stored
 * commandFilter allowlist pattern (e.g. "bash: npm *").
 * Supports exact match and * / ** wildcards.
 *
 * @example
 * patternMatches('bash: ls /tmp/foo', 'bash: ls *')    // true
 * patternMatches('edit: src/foo.ts', 'edit: src/**')   // true
 */
export function patternMatches(cmd: string, pattern: string): boolean {
  if (cmd === pattern) return true
  if (!pattern.includes('*')) return false
  // Escape regex special chars, then replace ** and * with .*
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '.*')
  try {
    return new RegExp(`^${regexStr}$`).test(cmd)
  } catch {
    return false
  }
}

/**
 * Get the set of sub-patterns for a permission request, each prefixed with
 * the permission type to match the commandFilter.allowlist format.
 *
 *  - For 'bash': split each pattern by && to get individual sub-commands,
 *    then prefix as "bash: <sub-command>"
 *  - For all other types: prefix each pattern as "permissionType: <pattern>"
 *
 * Returns a flat, deduplicated list for matching against commandFilter.allowlist.
 */
export function getSubPatterns(request: PermissionRequest): string[] {
  const type = request.permission
  if (type === 'bash') {
    const parts: string[] = []
    for (const p of request.patterns) {
      for (const sub of splitBashCommand(p)) {
        const prefixed = `bash: ${sub}`
        if (!parts.includes(prefixed)) parts.push(prefixed)
      }
    }
    return parts
  }
  // Non-bash permissions: prefix each raw pattern with the type
  return [...new Set(request.patterns.map((p) => `${type}: ${p}`))]
}

/**
 * Return true if ALL sub-patterns of the request are covered by the commandFilter allowlist.
 * An empty sub-pattern list (permission with no patterns) is NOT auto-approved.
 *
 * @param request   The incoming permission request from the OpenCode backend
 * @param allowlist The commandFilter.allowlist string[] from useSettingsStore
 */
export function checkAutoApprove(request: PermissionRequest, allowlist: string[]): boolean {
  const subPatterns = getSubPatterns(request)
  if (subPatterns.length === 0) return false
  return subPatterns.every((sub) => allowlist.some((allowed) => patternMatches(sub, allowed)))
}
