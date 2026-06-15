/**
 * Input rail — runs BEFORE any text reaches a model.
 *
 * Two jobs, both deterministic so the CI probe suite asserts them with no API key:
 *  1. maskPII   — mask obvious personal data with session-consistent placeholders.
 *  2. detectInjection — flag instruction-injection payloads in the use-case text.
 *
 * Honest scope: these are regex detectors, not Presidio / a trained classifier.
 * They catch the shapes people actually paste, and they are the CHEAP, pre-spend
 * layer. They are NOT the load-bearing defence. The load-bearing defence is
 * STRUCTURAL: the only irreversible action (commit_roadmap) lives outside the
 * agent loop and is unreachable without a human approval at the durable gate, so
 * no instruction smuggled through text — user input OR a retrieved pattern card —
 * can cause an action. See ARCHITECTURE.md "Security posture".
 */

export interface MaskResult {
  masked: string;
  found: { kind: string; placeholder: string }[];
}

const PII_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'EMAIL', re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g },
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}[ ]?(?:\d{4}[ ]?){4,7}\d{0,4}\b/g },
  { kind: 'DNI', re: /\b\d{8}[ -]?[A-HJ-NP-TV-Z]\b/g },
  { kind: 'NIE', re: /\b[XYZ]\d{7}[ -]?[A-HJ-NP-TV-Z]\b/g },
  { kind: 'PHONE', re: /(?:\+\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-]?)\d{3}[ .-]?\d{2,4}(?:[ .-]?\d{2,4})?\b/g },
];

export function maskPII(text: string): MaskResult {
  let masked = text;
  const found: MaskResult['found'] = [];
  for (const { kind, re } of PII_PATTERNS) {
    let counter = 0;
    masked = masked.replace(re, (match) => {
      if (kind === 'PHONE' && match.replace(/\D/g, '').length < 9) return match; // not a phone (year/quantity)
      counter += 1;
      const placeholder = `[${kind}_${counter}]`;
      found.push({ kind, placeholder });
      return placeholder;
    });
  }
  return { masked, found };
}

/**
 * Instruction-injection shapes aimed at steering the triage or the write path.
 * Each carries a label so a rejection is explainable, never a silent drop.
 */
const INJECTION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'override-instructions', re: /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+instructions?/i },
  { label: 'disregard-context', re: /disregard\s+(?:the\s+)?(?:above|previous|system|earlier)/i },
  { label: 'role-hijack', re: /\byou\s+are\s+now\b|\bact\s+as\s+(?:if\s+)?(?:you\s+are\s+)?(?:an?\s+)?(?:approved|authori[sz]ed|admin)/i },
  { label: 'system-prompt-probe', re: /\b(?:system\s+prompt|your\s+instructions|reveal\s+your)\b/i },
  { label: 'new-instructions', re: /\bnew\s+instructions?\s*:/i },
  { label: 'force-autonomy', re: /set\s+(?:the\s+)?autonomy\s+(?:tier\s+)?(?:to\s+)?(?:act|full|maximum)/i },
  { label: 'skip-gate', re: /skip\s+(?:the\s+)?(?:human\s+)?(?:gate|approval|review|critic)/i },
  { label: 'force-commit', re: /commit\s+(?:the\s+)?(?:roadmap\s+)?(?:immediately|now|automatically|without)/i },
  { label: 'force-verdict', re: /mark\s+(?:this|all|everything|them)\s+as\s+(?:approved|minimal|act|done)/i },
  { label: 'auto-approve', re: /auto[-\s]?approve|automatically\s+approve/i },
  { label: 'override-judge', re: /override\s+(?:the\s+)?(?:gate|critic|judge|classification|verdict)/i },
];

export interface InjectionResult {
  flagged: boolean;
  label: string | null;
}

export function detectInjection(text: string): InjectionResult {
  for (const { label, re } of INJECTION_PATTERNS) {
    if (re.test(text)) return { flagged: true, label };
  }
  return { flagged: false, label: null };
}
