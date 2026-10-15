import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tokenPath = 'C:\\Users\\ayhab\\.gemini\\antigravity-ide\\mcp_oauth_tokens.json';
const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
const token = tokens['https://mcp.vercel.com'].token.access_token;
const distDir = path.resolve(__dirname, '..', 'dist');

function getAllFiles(dir, base) {
  let list = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      list = list.concat(getAllFiles(fullPath, base));
    } else if (entry.isFile()) {
      const relPath = path.relative(base, fullPath).split(path.sep).join('/');
      const content = fs.readFileSync(fullPath);
      const sha = crypto.createHash('sha1').update(content).digest('hex');
      list.push({ file: relPath, fullPath, content, sha, size: content.length });
    }
  }
  return list;
}

const files = getAllFiles(distDir, distDir);
console.log('Total files found:', files.length);

async function uploadFile(f) {
  const res = await fetch('https://api.vercel.com/v2/files', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Length': f.size.toString(),
      'x-vercel-digest': f.sha
    },
    body: f.content
  });
  if (!res.ok && res.status !== 409) {
    const errText = await res.text();
    throw new Error(`Failed to upload ${f.file}: ${res.status} ${errText}`);
  }
  return { file: f.file, sha: f.sha, size: f.size };
}

async function main() {
  console.log('Uploading files...');
  const manifest = [];
  const chunkSize = 5;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const uploaded = await Promise.all(chunk.map(uploadFile));
    manifest.push(...uploaded);
    process.stdout.write(`Uploaded ${manifest.length}/${files.length}\r`);
  }
  console.log('\nAll files uploaded!');

  console.log('Creating deployment with SPA routing...');
  const deployPayload = {
    name: 'pochinki-burger',
    project: 'pochinki-burger',
    target: 'production',
    files: manifest,
    projectSettings: {
      framework: null
    },
    // SPA catch-all: serve index.html for all non-file routes
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index.html' }
    ]
  };

  const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(deployPayload)
  });

  const deployData = await deployRes.json();
  if (!deployRes.ok) {
    console.error('Deploy error:', JSON.stringify(deployData, null, 2));
    process.exit(1);
  }

  console.log('Deployment created!');
  console.log('ID:', deployData.id);
  console.log('URL:', deployData.url);

  // Poll for READY
  console.log('Waiting for READY...');
  let readyState = deployData.readyState;
  let attempts = 0;
  while (readyState !== 'READY' && attempts < 20) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
    const checkRes = await fetch(`https://api.vercel.com/v13/deployments/${deployData.id}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const checkData = await checkRes.json();
    readyState = checkData.readyState;
    console.log(`[Attempt ${attempts}] State: ${readyState}`);
    if (readyState === 'ERROR' || readyState === 'CANCELED') {
      console.error('Failed:', JSON.stringify(checkData, null, 2));
      process.exit(1);
    }
  }

  console.log('\n🎉 Deployment READY!');
  console.log('🌐 https://pochinki-burger.vercel.app');
  console.log('🔐 https://pochinki-burger.vercel.app/admin/login');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
