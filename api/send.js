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

function buildHtml(fields) {
  const servicesRaw = fields.services;
  const services = Array.isArray(servicesRaw)
    ? servicesRaw.join(', ')
    : (servicesRaw ?? '');

  const rows = [
    ['Name',      first(fields.name)],
    ['Phone',     first(fields.phone)],
    ['Email',     first(fields.email)],
    ['Boat Info', first(fields.boat_info)],
    ['Services',  services],
    ['Location',  first(fields.location)],
    ['Message',   first(fields.message)],
  ]
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
    Submitted via torontoyachtclub.ca/inquiries
  </p>
  <table style="border-collapse:collapse;width:100%;">${rows}</table>
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

  const resend = new Resend(process.env.RESEND_API_KEY);

  let result;
  try {
    result = await resend.emails.send({
      from: 'forms@mail.torontoyachtclub.ca',
      to: 'javier@torontoyachtclub.ca',
      cc: ['nick@torontoyachtclub.ca'],
      ...(first(fields.email) && { replyTo: first(fields.email) }),
      subject: 'New inquiry from torontoyachtclub.ca',
      html: buildHtml(fields),
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
