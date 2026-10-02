// Step 1: read the CV and split personal details from everything else.
// This runs entirely on our server with plain code. Personal details never reach any AI call.
import mammoth from 'mammoth';

export async function fileToText(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return value;
  }
  if (ext === 'txt' || ext === 'md') return Buffer.from(buffer).toString('utf8');
  throw new Error(`Unsupported file type ".${ext}". Upload PDF, DOCX or TXT.`);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\(?\d[\d\s().-]{8,}\d/g;
const digitCount = (m) => m.replace(/\D/g, '').length;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s|,;)]+/gi;
const NOT_A_NAME = /\b(resume|curriculum|vitae|cv|profile|summary|objective|contact|experience|education|skills|product|manager|senior|pm|spm|apm|experienced|professional|results|driven|dynamic|passionate|strategic|technical|lead|leader|owner|analyst|consultant|engineer|years|work|history|key|achievements|about|me|career|highlights|personal|details|email|phone|mobile|address|linkedin|github|portfolio|bengaluru|bangalore|mumbai|delhi|pune|india)\b/i;

const titleCase = (s) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).trim();

function nameFromFilename(filename) {
  const base = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-.()]+/g, ' ')
    .replace(/\b(cv|resume|final|updated|latest|pm|spm|apm|copy|v\d+|\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^[A-Za-z]+( [A-Za-z]+){1,3}$/.test(base) ? titleCase(base) : '';
}

function guessName(text, filename, email) {
  // 1) File name, if every part of it also appears in the CV text
  const fromFile = nameFromFilename(filename);
  if (fromFile) {
    const lower = text.toLowerCase();
    if (fromFile.toLowerCase().split(' ').every((p) => lower.includes(p))) return fromFile;
  }
  // 2) A name-shaped line near the top
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 10);
  for (const raw of lines) {
    const l = raw.split(/\s*[|•·,]\s*|\s+[-–—]\s+/)[0].replace(/^name\s*[:-]\s*/i, '').trim();
    if (l.length < 3 || l.length > 40 || /[0-9@/]/.test(l) || NOT_A_NAME.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) continue;
    return titleCase(l);
  }
  // 3) File name even if unconfirmed, then the email address
  if (fromFile) return fromFile;
  if (email) {
    const parts = email.split('@')[0].replace(/\d+/g, '').split(/[._-]+/).filter((p) => p.length > 1);
    if (parts.length >= 2) return titleCase(parts.slice(0, 3).join(' '));
  }
  return '';
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function separatePersonalDetails(rawText, filename) {
  const text = rawText.replace(/\u00a0/g, ' ');
  let email = (text.match(EMAIL_RE) || [])[0] || '';
  const name = guessName(text, filename, email);
  for (const part of name.split(/\s+/)) {
    if (part.length >= 3 && email.toLowerCase().startsWith(part.toLowerCase()) && /^[A-Z]+/.test(email)) {
      email = email.slice(part.length);
    }
  }
  const phoneRaw = (text.match(PHONE_RE) || []).find((m) => digitCount(m) >= 10) || '';
  let phone = '';
  if (phoneRaw) {
    const d = phoneRaw.replace(/\D/g, '');
    const local = d.startsWith('91') && d.length >= 12 ? d.slice(2, 12) : d.slice(0, 10);
    phone = `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  const linkedin = (text.match(LINKEDIN_RE) || [])[0] || '';

  let redacted = text
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(LINKEDIN_RE, '[LINK]')
    .replace(PHONE_RE, (m) => (digitCount(m) >= 10 ? '[PHONE]' : m));

  if (name) {
    redacted = redacted.replace(new RegExp(escapeRe(name), 'gi'), '[CANDIDATE]');
    for (const part of name.split(/\s+/)) {
      if (part.length >= 3) redacted = redacted.replace(new RegExp(`\\b${escapeRe(part)}\\b`, 'gi'), '[CANDIDATE]');
    }
  }
  redacted = redacted.replace(/(\[CANDIDATE\]\s*){2,}/g, '[CANDIDATE] ').replace(/\n{3,}/g, '\n\n').trim();

  return { personal: { name, email, phone, linkedin }, content: redacted.slice(0, 20000) };
}
