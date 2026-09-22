// Read-only production gate. Never reads records or writes business data.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY as key} from '../src/config.js';
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
for(const table of ['players','votes','app_config','player_results','anonymous_comments']){
 const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`,{method:'HEAD',headers,signal:AbortSignal.timeout(15000)});
 if(![401,403,404].includes(r.status))throw new Error(`Unsafe boundary: ${table} returned ${r.status}`);
 console.log(`${table}: denied (${r.status})`);
}
const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/secure_api`,{method:'POST',headers,body:JSON.stringify({payload:{action:'read'}}),signal:AbortSignal.timeout(15000)});
if(![401,403].includes(r.status))throw new Error(`Anonymous RPC boundary: ${r.status}`);
console.log(`Anonymous RPC: denied (${r.status})`);
