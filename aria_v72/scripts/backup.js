'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync, backup } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const sourceDb = path.resolve(process.env.ARIA_DB_PATH || path.join(ROOT, 'data', 'aria.sqlite'));
const uploadsDir = path.join(ROOT, 'public', 'uploads');
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(ROOT, 'backups'));
const keepDays = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS || 14));

function stamp() { return new Date().toISOString().replace(/[:.]/g,'-'); }
function copyDir(src,dst){ if(!fs.existsSync(src)) return; fs.mkdirSync(dst,{recursive:true}); for(const ent of fs.readdirSync(src,{withFileTypes:true})){ const s=path.join(src,ent.name),d=path.join(dst,ent.name); if(ent.isDirectory())copyDir(s,d); else if(ent.isFile())fs.copyFileSync(s,d); } }
function prune(){ if(!fs.existsSync(backupRoot))return; const cutoff=Date.now()-keepDays*86400000; for(const name of fs.readdirSync(backupRoot)){const full=path.join(backupRoot,name);try{const st=fs.statSync(full);if(st.isDirectory()&&st.mtimeMs<cutoff)fs.rmSync(full,{recursive:true,force:true});}catch{}} }

(async()=>{
  if(!fs.existsSync(sourceDb)) throw new Error(`SQLite database not found: ${sourceDb}`);
  fs.mkdirSync(backupRoot,{recursive:true});
  const destDir=path.join(backupRoot,`aria-${stamp()}`); fs.mkdirSync(destDir,{recursive:true});
  const source=new DatabaseSync(sourceDb);
  try { await backup(source,path.join(destDir,'aria.sqlite')); }
  finally { try{source.close()}catch{} }
  copyDir(uploadsDir,path.join(destDir,'uploads'));
  fs.writeFileSync(path.join(destDir,'backup-info.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceDb,uploadsIncluded:fs.existsSync(uploadsDir)},null,2));
  prune();
  console.log(destDir);
})().catch(e=>{console.error(e);process.exit(1)});
