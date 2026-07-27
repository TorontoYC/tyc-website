'use strict';

const fs = require('fs');
const { formidable } = require('formidable');
const { Resend } = require('resend');

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

// Cap at 15 MB raw. Javier's inbox is Gmail (Google Workspace), which rejects incoming
// messages larger than ~25 MB on the wire. Base64 encoding inflates attachments ~33%,
// so a 25 MB raw upload becomes ~33 MB in transit and bounces silently. 15 MB raw
// encodes to ~20 MB on the wire, keeping well inside Gmail's receive limit.
// Do not raise this without accounting for the Base64 overhead.
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

// Fields excluded from the email body (internal / honeypot).
const SKIP = new Set(['_honey', '_form_name']);

const BLOCKED_EMAILS = [
  'veronicabecca1206@gmail.com',
  'henry.baker19889@gmail.com',
];

const AGENCY_PITCH_PATTERNS = [
  ['seo', /\bseo\b/i],
  ['search engine optimi', /\bsearch engine optimi(?:(?:z|s)(?:ation|e|ing|ed))?\b/i],
  ['keyword rank', /\bkeyword rank\b/i],
  ['keyword ranking', /\bkeyword ranking\b/i],
  ['backlink', /\bbacklink\b/i],
  ['link building', /\blink building\b/i],
  ['organic growth', /\borganic growth\b/i],
  ['organic traffic', /\borganic traffic\b/i],
  ['digital marketing', /\bdigital marketing\b/i],
  ['web design', /\bweb design\b/i],
  ['website redesign', /\bwebsite redesign\b/i],
  ['first page of google', /\bfirst page of google\b/i],
  ['guest post', /\bguest post\b/i],
  ['increase your sales', /\bincrease your sales\b/i],
  ['brief plan with pricing', /\bbrief plan with pricing\b/i],
  ['pricing proposal', /\bpricing proposal\b/i],
];

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// formidable v3 returns every field as an array; grab the first value.
function first(v) {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function formatLabel(name) {
  if (name === 'boat_loa') return 'Boat LOA';
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isLikelySpam(fields) {
  const reasons = [];
  let flagged = false;

  const services = Array.isArray(fields.services)
    ? fields.services
    : (first(fields.services) ? [first(fields.services)] : []);
  const serviceCount = services.filter((value) => String(value).trim()).length;
  if (serviceCount >= 8) {
    flagged = true;
    reasons.push(`Selected ${serviceCount} services (threshold: 8)`);
  }

  const message = String(first(fields.message));
  const matchedTerms = AGENCY_PITCH_PATTERNS
    .filter(([, pattern]) => pattern.test(message))
    .map(([term]) => term);
  if (matchedTerms.length > 0) {
    flagged = true;
    reasons.push(`Agency pitch language: ${matchedTerms.join(', ')}`);
  }

  const phoneDigits = String(first(fields.phone)).replace(/\D/g, '');
  if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
    reasons.push(`Implausible phone: ${phoneDigits.length} digits`);
  }

  const email = String(first(fields.email)).trim().toLowerCase();
  if (BLOCKED_EMAILS.includes(email)) {
    flagged = true;
    reasons.push(`Blocked email: ${email}`);
  }

  return { flagged, reasons };
}

function buildHtml(fields) {
  const formName = first(fields._form_name) || 'form submission';

  const rows = Object.entries(fields)
    .filter(([key]) => !SKIP.has(key) && !key.startsWith('_'))
    .map(([key, val]) => {
      const value = Array.isArray(val) ? val.join(', ') : first(val);
      return [formatLabel(key), value];
    })
    .filter(([, v]) => v)
    .map(([label, value]) =>
      `<tr>
        <td style="padding:6px 16px 6px 0;font-weight:600;vertical-align:top;white-space:nowrap;color:#0b1d33;">${esc(label)}</td>
        <td style="padding:6px 0;color:#333;vertical-align:top;">${esc(value)}</td>
      </tr>`
    )
    .join('');

  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222;">
  <p style="margin:0 0 16px;font-size:12px;color:#999;border-bottom:1px solid #eee;padding-bottom:10px;">
    ${esc(formName)} - torontoyachtclub.ca
  </p>
  <table style="border-collapse:collapse;width:100%;">${rows}</table>
</div>`;
}

function buildFlagReasonsHtml(reasons) {
  const items = reasons.map((reason) => `<li>${esc(reason)}</li>`).join('');
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5;color:#777;border-top:1px solid #eee;margin-top:18px;padding-top:12px;">
  <strong>Flag reasons</strong>
  <ul style="margin:6px 0 0;padding-left:20px;">${items}</ul>
</div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxTotalFileSize: MAX_TOTAL_BYTES,
    allowEmptyFiles: true,
    minFileSize: 0,
  });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    if (err.httpCode === 413) {
      return res.status(413).json({
        error:
          'Your photos are too large to send. Please reduce the file sizes or attach fewer photos (15 MB total limit) and try again.',
      });
    }
    console.error('Multipart parse error:', err.message);
    return res.status(400).json({ error: 'Could not read your submission. Please try again.' });
  }

  // Silent bot drop
  if (first(fields._honey)) {
    return res.status(200).json({ ok: true });
  }

  // File type validation
  const uploaded = (files.attachment ?? []).filter((f) => f.size > 0);
  const badFiles = uploaded.filter((f) => !ALLOWED_TYPES.has(f.mimetype));
  if (badFiles.length > 0) {
    const names = badFiles.map((f) => f.originalFilename || 'unknown').join(', ');
    return res.status(415).json({
      error: `Unsupported file type: ${names}. Please attach images (JPG, PNG, WEBP, HEIC) or PDFs only.`,
    });
  }

  // Read file buffers, then clean up temp files regardless of outcome
  let attachments = [];
  try {
    attachments = uploaded.map((f) => ({
      filename: f.originalFilename || 'attachment',
      content: fs.readFileSync(f.filepath),
    }));
  } finally {
    for (const f of uploaded) {
      try { fs.unlinkSync(f.filepath); } catch (_) {}
    }
  }

  const formName = first(fields._form_name) || 'form submission';
  const spamCheck = isLikelySpam(fields);
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (spamCheck.flagged) {
    console.error('Flagged form submission:', spamCheck.reasons);
  }

  let result;
  try {
    result = await resend.emails.send({
      from: 'forms@mail.torontoyachtclub.ca',
      to: spamCheck.flagged
        ? 'nick@torontoyachtclub.ca'
        : 'javier@torontoyachtclub.ca',
      ...(!spamCheck.flagged && { cc: ['nick@torontoyachtclub.ca'] }),
      ...(first(fields.email) && { replyTo: first(fields.email) }),
      subject: `${spamCheck.flagged ? '[FLAGGED] ' : ''}New ${formName} from torontoyachtclub.ca`,
      html: spamCheck.flagged
        ? `${buildHtml(fields)}${buildFlagReasonsHtml(spamCheck.reasons)}`
        : buildHtml(fields),
      ...(attachments.length > 0 && { attachments }),
    });
  } catch (err) {
    console.error('Resend send threw:', err.message);
    return res.status(500).json({
      error: 'Your message could not be sent. Please try again or call us at 289-325-0457.',
    });
  }

  if (result.error) {
    console.error('Resend API error:', JSON.stringify(result.error));
    return res.status(500).json({
      error: 'Your message could not be sent. Please try again or call us at 289-325-0457.',
    });
  }

  return res.status(200).json({ ok: true });
};
