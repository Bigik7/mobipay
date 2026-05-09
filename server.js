/**
 * Plateforme USSD / WhatsApp — Afrique de l'Ouest
 * Backend Node.js — Africa's Talking + WhatsApp Business API
 * Multi-pays : TG, SN, CI, GH, ML, BF
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// ─── Configuration opérateurs par pays ───────────────────────────────────────
const OPERATORS = {
  TG: { name: 'Togo',         currency: 'FCFA', operators: ['TMoney', 'Flooz'],          code: '+228' },
  SN: { name: 'Sénégal',      currency: 'FCFA', operators: ['Orange Money', 'Wave'],     code: '+221' },
  CI: { name: "Côte d'Ivoire",currency: 'FCFA', operators: ['MTN MoMo', 'Orange Money'], code: '+225' },
  GH: { name: 'Ghana',        currency: 'GHS',  operators: ['MTN MoMo', 'Vodafone Cash'],code: '+233' },
  ML: { name: 'Mali',         currency: 'FCFA', operators: ['Orange Money', 'Moov'],     code: '+223' },
  BF: { name: 'Burkina Faso', currency: 'FCFA', operators: ['Orange Money', 'Moov'],     code: '+226' },
};

// ─── Arbre de menus USSD ─────────────────────────────────────────────────────
const USSD_MENUS = {
  '': {
    text: (country) => `Bienvenue sur MobiPay ${OPERATORS[country]?.name || ''}\n\n1. Envoyer de l'argent\n2. Voir mon solde\n3. Payer une facture\n4. Recharger crédit\n5. Historique\n6. Mon compte\n0. Quitter`,
    next: { '1': 'send', '2': 'balance', '3': 'pay', '4': 'recharge', '5': 'history', '6': 'account', '0': 'quit' }
  },
  send: {
    text: () => "Envoyer de l'argent\n\nEntrez le numéro du bénéficiaire :\n\n00. Retour menu",
    next: { '00': '' }
  },
  send_amount: {
    text: (_, meta) => `Bénéficiaire : ${meta.recipient}\n\nEntrez le montant à envoyer :\n(Minimum : 100 FCFA)\n\n00. Annuler`,
    next: { '00': '' }
  },
  send_confirm: {
    text: (_, meta) => `Confirmer l'envoi ?\n\nDest. : ${meta.recipient}\nMontant : ${meta.amount} FCFA\nFrais : ${Math.ceil(meta.amount * 0.01)} FCFA\nTotal débité : ${meta.amount + Math.ceil(meta.amount * 0.01)} FCFA\n\n1. Confirmer\n2. Annuler`,
    next: { '1': 'send_pin', '2': '' }
  },
  send_pin: {
    text: () => "Entrez votre code PIN :\n\n00. Annuler",
    next: { '00': '' }
  },
  send_done: {
    text: (_, meta) => `Transaction réussie !\n\nMontant envoyé : ${meta.amount} FCFA\nBénéficiaire : ${meta.recipient}\nRéf : TXN${Date.now().toString().slice(-8)}\n\nVous recevrez un SMS.\n\n0. Menu principal`,
    next: { '0': '' }
  },
  balance: {
    text: () => "Entrez votre code PIN pour consulter votre solde :\n\n00. Retour",
    next: { '00': '' }
  },
  balance_show: {
    text: (_, meta) => `Votre solde\n\n━━━━━━━━━━━━━━━━\nSolde principal : ${meta.balance} FCFA\nBonus : ${meta.bonus} FCFA\n━━━━━━━━━━━━━━━━\n\n0. Menu principal`,
    next: { '0': '' }
  },
  pay: {
    text: () => "Payer une facture\n\n1. CEET / Électricité\n2. TdE / Eau\n3. Internet / Fibre\n4. École / Frais scol.\n5. Autres services\n\n00. Retour",
    next: { '00': '', '1': 'pay_ref', '2': 'pay_ref', '3': 'pay_ref', '4': 'pay_ref', '5': 'pay_ref' }
  },
  pay_ref: {
    text: () => "Entrez votre numéro d'abonné / référence :\n\n00. Retour",
    next: { '00': 'pay' }
  },
  pay_confirm: {
    text: (_, meta) => `Paiement facture\n\nService : ${meta.service}\nRéférence : ${meta.ref}\nMontant : ${meta.amount} FCFA\n\n1. Payer\n2. Annuler`,
    next: { '1': 'pay_done', '2': '' }
  },
  pay_done: {
    text: () => `Paiement effectué !\n\nVotre facture a été réglée.\nRéf : PAY${Date.now().toString().slice(-8)}\n\n0. Menu principal`,
    next: { '0': '' }
  },
  recharge: {
    text: () => "Recharger crédit téléphonique\n\n1. Mon numéro\n2. Autre numéro\n\n00. Retour",
    next: { '00': '', '1': 'recharge_amount', '2': 'recharge_num' }
  },
  recharge_num: {
    text: () => "Entrez le numéro à recharger :\n\n00. Retour",
    next: { '00': 'recharge' }
  },
  recharge_amount: {
    text: () => "Choisissez le montant :\n\n1. 200 FCFA\n2. 500 FCFA\n3. 1 000 FCFA\n4. 2 000 FCFA\n5. 5 000 FCFA\n\n00. Retour",
    next: { '00': 'recharge', '1': 'recharge_done', '2': 'recharge_done', '3': 'recharge_done', '4': 'recharge_done', '5': 'recharge_done' }
  },
  recharge_done: {
    text: () => `Rechargement réussi !\n\nVotre crédit a été ajouté.\nRéf : RCH${Date.now().toString().slice(-8)}\n\n0. Menu principal`,
    next: { '0': '' }
  },
  history: {
    text: () => "Vos 5 dernières transactions :\n\n24/04 Envoi    -5 000 F\n22/04 Recharge -1 000 F\n20/04 Facture  -8 200 F\n18/04 Reçu     +12 000 F\n15/04 Envoi    -3 500 F\n\n0. Menu principal",
    next: { '0': '' }
  },
  account: {
    text: (_, meta) => `Mon compte\n\nNuméro : ${meta.phone}\nStatut : Actif\nLimite journalière : 500 000 F\n\n1. Changer PIN\n2. Aide / Support\n\n0. Menu principal`,
    next: { '0': '', '1': 'change_pin', '2': 'support' }
  },
  support: {
    text: () => "Besoin d'aide ?\n\nAppeler le : 1515\nWhatsApp : +228 90 00 00 00\nEmail : support@mobipay.com\n\n0. Menu principal",
    next: { '0': '' }
  },
  quit: {
    text: () => "Merci d'utiliser MobiPay !\n\nÀ bientôt.",
    next: {}
  }
};

// ─── Stockage sessions USSD en mémoire ───────────────────────────────────────
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { state: '', meta: {}, history: [] });
  }
  return sessions.get(sessionId);
}

// ─── Endpoint USSD (Africa's Talking format) ─────────────────────────────────
app.post('/ussd', (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  const country = detectCountry(phoneNumber);
  const session = getSession(sessionId);
  const parts = (text || '').split('*');
  const lastInput = parts[parts.length - 1];

  let response = '';

  try {
    const currentMenu = USSD_MENUS[session.state];
    if (!currentMenu) {
      session.state = '';
    }

    // Logique de navigation avec état enrichi
    if (session.state === '' && lastInput === '') {
      response = `CON ${USSD_MENUS[''].text(country)}`;
    } else if (session.state === '' && lastInput) {
      const next = USSD_MENUS[''].next[lastInput];
      if (next !== undefined) {
        session.state = next;
        if (next === 'quit') {
          response = `END ${USSD_MENUS['quit'].text()}`;
        } else {
          response = `CON ${USSD_MENUS[next].text(country, session.meta)}`;
        }
      } else {
        response = `CON Option invalide.\n\n${USSD_MENUS[''].text(country)}`;
      }
    } else if (session.state === 'send' && lastInput !== '00') {
      session.meta.recipient = lastInput;
      session.state = 'send_amount';
      response = `CON ${USSD_MENUS['send_amount'].text(country, session.meta)}`;
    } else if (session.state === 'send_amount' && lastInput !== '00') {
      session.meta.amount = parseInt(lastInput) || 0;
      session.state = 'send_confirm';
      response = `CON ${USSD_MENUS['send_confirm'].text(country, session.meta)}`;
    } else if (session.state === 'send_confirm' && lastInput === '1') {
      session.state = 'send_pin';
      response = `CON ${USSD_MENUS['send_pin'].text(country, session.meta)}`;
    } else if (session.state === 'send_pin' && lastInput !== '00') {
      session.state = 'send_done';
      response = `END ${USSD_MENUS['send_done'].text(country, session.meta)}`;
      sessions.delete(sessionId);
    } else if (session.state === 'balance' && lastInput !== '00') {
      session.meta.balance = '24 750';
      session.meta.bonus = '500';
      session.state = 'balance_show';
      response = `END ${USSD_MENUS['balance_show'].text(country, session.meta)}`;
      sessions.delete(sessionId);
    } else if (session.state === 'pay_ref' && lastInput !== '00') {
      session.meta.ref = lastInput;
      session.meta.service = 'CEET Électricité';
      session.meta.amount = 12400;
      session.state = 'pay_confirm';
      response = `CON ${USSD_MENUS['pay_confirm'].text(country, session.meta)}`;
    } else if (session.state === 'pay_confirm' && lastInput === '1') {
      response = `END ${USSD_MENUS['pay_done'].text(country, session.meta)}`;
      sessions.delete(sessionId);
    } else {
      // Navigation générique
      const menu = USSD_MENUS[session.state];
      if (menu && menu.next[lastInput] !== undefined) {
        const nextState = menu.next[lastInput];
        session.state = nextState;
        const nextMenu = USSD_MENUS[nextState];
        if (nextMenu) {
          const menuText = nextMenu.text(country, session.meta);
          response = nextState === 'quit' || nextState === 'send_done' || nextState === 'pay_done' || nextState === 'recharge_done'
            ? `END ${menuText}`
            : `CON ${menuText}`;
          if (response.startsWith('END')) sessions.delete(sessionId);
        }
      } else {
        session.state = '';
        response = `CON Option invalide. Retour menu.\n\n${USSD_MENUS[''].text(country)}`;
      }
    }
  } catch (err) {
    console.error('USSD Error:', err);
    response = 'END Une erreur est survenue. Veuillez réessayer.';
    sessions.delete(sessionId);
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// ─── Endpoint WhatsApp Webhook ────────────────────────────────────────────────
app.post('/whatsapp/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const messages = changes?.value?.messages;

      if (messages?.length > 0) {
        const msg = messages[0];
        const from = msg.from;
        const msgType = msg.type;

        let userText = '';
        if (msgType === 'text') userText = msg.text.body;
        else if (msgType === 'interactive') {
          userText = msg.interactive?.button_reply?.title ||
                     msg.interactive?.list_reply?.title || '';
        }

        const reply = await processWhatsAppMessage(from, userText);
        await sendWhatsAppMessage(from, reply);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.sendStatus(500);
  }
});

// Vérification webhook Meta
app.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'mobipay_secret_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── Logique chatbot WhatsApp ─────────────────────────────────────────────────
const waStates = new Map();

async function processWhatsAppMessage(from, text) {
  const t = text.toLowerCase().trim();
  const state = waStates.get(from) || { step: 'menu' };

  // Menu principal
  if (t === 'menu' || t === 'start' || t === 'bonjour' || t === 'salut' || state.step === 'menu') {
    waStates.set(from, { step: 'menu' });
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: "Bienvenue sur *MobiPay* 👋\nQue souhaitez-vous faire ?" },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'send',    title: '💸 Envoyer argent' }},
            { type: 'reply', reply: { id: 'balance', title: '💰 Voir solde'     }},
            { type: 'reply', reply: { id: 'pay',     title: '📋 Payer facture'  }},
          ]
        }
      }
    };
  }

  if (t === 'envoyer argent' || t === 'send' || state.step === 'ask_recipient') {
    if (state.step !== 'ask_recipient') {
      waStates.set(from, { step: 'ask_recipient' });
      return { type: 'text', text: { body: "Entrez le numéro du bénéficiaire :\n_(ex: +228 90 12 34 56)_" }};
    }
    waStates.set(from, { step: 'ask_amount', recipient: text });
    return { type: 'text', text: { body: `Bénéficiaire : *${text}*\n\nQuel montant souhaitez-vous envoyer ? (en FCFA)` }};
  }

  if (state.step === 'ask_amount') {
    const amount = parseInt(text.replace(/\s/g, ''));
    if (isNaN(amount) || amount < 100) {
      return { type: 'text', text: { body: "Montant invalide. Entrez un montant minimum de 100 FCFA." }};
    }
    const frais = Math.ceil(amount * 0.01);
    waStates.set(from, { ...state, step: 'confirm_send', amount });
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `Confirmer l'envoi ?\n\n*Destinataire :* ${state.recipient}\n*Montant :* ${amount.toLocaleString()} FCFA\n*Frais :* ${frais.toLocaleString()} FCFA\n*Total :* ${(amount + frais).toLocaleString()} FCFA` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'confirm_yes', title: '✅ Confirmer' }},
            { type: 'reply', reply: { id: 'confirm_no',  title: '❌ Annuler'   }},
          ]
        }
      }
    };
  }

  if (t === 'confirmer' || t === 'confirm_yes') {
    waStates.set(from, { step: 'menu' });
    const ref = 'TXN' + Date.now().toString().slice(-8);
    return { type: 'text', text: { body: `✅ *Transaction réussie !*\n\nRéférence : \`${ref}\`\nMontant envoyé : ${state.amount?.toLocaleString() || '—'} FCFA\n\nUn SMS de confirmation vous a été envoyé.\n\nTapez *menu* pour revenir à l'accueil.` }};
  }

  if (t === 'voir solde' || t === 'balance') {
    waStates.set(from, { step: 'menu' });
    return { type: 'text', text: { body: "💰 *Votre solde MobiPay*\n\n━━━━━━━━━━━━━━\nSolde principal : *24 750 FCFA*\nBonus disponible : *500 FCFA*\n━━━━━━━━━━━━━━\n\n_Mis à jour à l'instant_\n\nTapez *menu* pour revenir." }};
  }

  if (t === 'payer facture' || t === 'pay') {
    waStates.set(from, { step: 'choose_bill' });
    return {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: "Quelle facture souhaitez-vous payer ?" },
        action: {
          button: 'Choisir',
          sections: [{
            title: 'Services disponibles',
            rows: [
              { id: 'ceet',    title: 'CEET — Électricité',    description: 'Société d\'Énergie Électrique du Togo' },
              { id: 'tde',     title: 'TdE — Eau potable',     description: 'Togolaise des Eaux' },
              { id: 'topnet',  title: 'Topnet — Internet',     description: 'Abonnement internet' },
              { id: 'ecole',   title: 'École — Frais scolaires',description: 'Paiement frais de scolarité' },
            ]
          }]
        }
      }
    };
  }

  // Fallback
  waStates.set(from, { step: 'menu' });
  return { type: 'text', text: { body: "Je n'ai pas compris votre demande. Tapez *menu* pour voir les options disponibles." }};
}

async function sendWhatsAppMessage(to, payload) {
  const WA_TOKEN = process.env.WA_TOKEN;
  const PHONE_ID = process.env.WA_PHONE_NUMBER_ID;

  if (!WA_TOKEN || !PHONE_ID) {
    console.log('[WhatsApp] Simulation — message à', to, ':', JSON.stringify(payload));
    return;
  }

  const body = { messaging_product: 'whatsapp', to, ...payload };
  const resp = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) console.error('WhatsApp send error:', await resp.text());
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function detectCountry(phone) {
  if (!phone) return 'TG';
  if (phone.startsWith('+228') || phone.startsWith('228')) return 'TG';
  if (phone.startsWith('+221') || phone.startsWith('221')) return 'SN';
  if (phone.startsWith('+225') || phone.startsWith('225')) return 'CI';
  if (phone.startsWith('+233') || phone.startsWith('233')) return 'GH';
  if (phone.startsWith('+223') || phone.startsWith('223')) return 'ML';
  if (phone.startsWith('+226') || phone.startsWith('226')) return 'BF';
  return 'TG';
}

// ─── API REST dashboard ───────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const { country } = req.query;
  const stats = {
    sessions: country ? Math.floor(Math.random() * 15000) : 48203,
    volume_fcfa: country ? Math.floor(Math.random() * 700000000) : 2400000000,
    completion_rate: (65 + Math.random() * 20).toFixed(1),
    active_countries: country ? 1 : 6,
    channels: { ussd: 62, whatsapp: 28, sms: 10 },
    top_services: [
      { name: 'Transfert', pct: 38 },
      { name: 'Solde', pct: 27 },
      { name: 'Paiement', pct: 18 },
      { name: 'Recharge', pct: 11 },
      { name: 'Autres', pct: 6 },
    ]
  };
  res.json(stats);
});

app.get('/api/transactions', (req, res) => {
  const txns = [
    { country: 'TG', channel: 'USSD',     service: 'Transfert TMoney',  amount: 15000,  status: 'success', ts: new Date().toISOString() },
    { country: 'SN', channel: 'WhatsApp', service: 'Paiement Orange',   amount: 22500,  status: 'success', ts: new Date().toISOString() },
    { country: 'CI', channel: 'USSD',     service: 'Recharge MTN',      amount: 5000,   status: 'success', ts: new Date().toISOString() },
    { country: 'GH', channel: 'SMS',      service: 'Solde MoMo',        amount: null,   status: 'success', ts: new Date().toISOString() },
    { country: 'ML', channel: 'USSD',     service: 'Transfert Orange',  amount: 30000,  status: 'success', ts: new Date().toISOString() },
    { country: 'BF', channel: 'WhatsApp', service: 'Paiement facture',  amount: 8200,   status: 'failed',  ts: new Date().toISOString() },
  ];
  res.json(txns);
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── Lancement serveur ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MobiPay USSD/WhatsApp Server running on port ${PORT}`);
  console.log(`USSD endpoint  : POST /ussd`);
  console.log(`WhatsApp hook  : POST /whatsapp/webhook`);
  console.log(`Dashboard API  : GET  /api/stats`);
});

module.exports = app;
