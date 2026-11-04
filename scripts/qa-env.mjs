// Where the browser QA scripts find Playwright and Chrome, so they run on any machine.
// Playwright: this repo's node_modules or NODE_PATH first (e.g. npm i --no-save playwright), then the original Codex runtime.
// Chrome: QA_CHROME, else the usual install paths; with none found, Playwright's own Chromium (npx playwright install chromium).
import {createRequire} from 'node:module';import {existsSync} from 'node:fs';
function load(){
  for(const from of [import.meta.url,'C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs']){
    try{return createRequire(from)('playwright');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
  }
  throw Error('找不到 Playwright：在仓库里执行 npm i --no-save playwright，或把 NODE_PATH 指向装有它的 node_modules');
}
export const {chromium}=load();
const local=process.env.LOCALAPPDATA;
export const CHROME=[process.env.QA_CHROME,'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  local&&`${local}/Google/Chrome/Application/chrome.exe`,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
