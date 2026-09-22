const required=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID','VITE_APP_CHECK_SITE_KEY'];
if(required.some(k=>!process.env[k]?.trim()))throw new Error('Public Firebase/App Check configuration is incomplete. Deployment blocked.');
if(process.env.VITE_FIREBASE_PROJECT_ID!=='halisaha-8913e')throw new Error('Unexpected production Firebase project.');
if(!/^[a-z0-9.-]+$/.test(process.env.VITE_FIREBASE_AUTH_DOMAIN))throw new Error('Invalid auth domain.');
