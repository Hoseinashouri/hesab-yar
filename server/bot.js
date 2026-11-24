require('dotenv').config();
const { Bot } = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ BOT_TOKEN is missing! Set it in Render environment variables.');
  process.exit(1);
}

const APP_URL = process.env.APP_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}`;
const PORT = process.env.PORT || 8080;

const users = new Map();
const bot = new Bot(BOT_TOKEN);

// ─── HELPERS ──────────────────────────────────────────────
function sendWelcome(chatId) {
  bot.sendMessage(chatId, `
👋 سلام! به **حساب‌یار** خوش آمدی!

💰 مدیریت هوشمند مالی تو:
✅ ثبت درآمد و هزینه با دسته‌بندی
✅ یادآوری پرداخت‌ها (مثل قبض، اجاره)
✅ بودجه‌بندی ماهانه برای هر دسته
✅ اهداف پس‌انداز (خرید لپ‌تاپ، مسافرت...)
✅ چند حساب (کیف پول، بانک，اعتباری)

👇 اپ رو باز کن:
  `.trim(), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 باز کردن حساب‌یار', web_app: { url: APP_URL } }]
      ]
    }
  });
}

function sendHelp(chatId) {
  bot.sendMessage(chatId, `
📋 **دستورات حساب‌یار:**
/start — شروع و باز کردن اپ
/balance — موجودی فعلی
/stats — آمار کلی
/categories — دسته‌بندی‌ها
/remind — تنظیم یادآور دستی
/budget — تعریف بودجه ماهانه
/goal — هدف پس‌انداز
/clear — پاک کردن داده‌ها
  `.trim(), { parse_mode: 'Markdown' });
}

function sendBalance(chatId) {
  const userId = String(chatId);
  const data = users.get(userId) || { transactions: [], reminders: [] };
  const txns = data.transactions || [];
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  bot.sendMessage(chatId,
    `💰 موجودی: ${(income - expense).toLocaleString()} تومان\n📈 درآمد: ${income.toLocaleString()}\n📉 هزینه: ${expense.toLocaleString()}`
  );
}

function sendStats(chatId) {
  const userId = String(chatId);
  const data = users.get(userId) || { transactions: [] };
  const txns = data.transactions || [];
  const count = txns.length;
  const budgets = data.budgets?.length || 0;
  const goals = data.goals?.length || 0;
  bot.sendMessage(chatId,
    `📊 آمار شما:\n تراکنش: ${count}\n بودجه: ${budgets}\n هدف: ${goals}\n یادآور: ${data.reminders?.length || 0}`
  );
}

function setReminderState(chatId) {
  users.set(chatId, { state: { type: 'reminder', step: 1 } });
}

function setBudgetState(chatId) {
  users.set(chatId, { state: { type: 'budget', step: 1 } });
}

function setGoalState(chatId) {
  users.set(chatId, { state: { type: 'goal', step: 1 } });
}

// ─── MESSAGE HANDLER ──────────────────────────────────────
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return;

  // Commands
  if (text === '/start') { sendWelcome(chatId); return; }
  if (text === '/help')  { sendHelp(chatId); return; }
  if (text === '/balance') { sendBalance(chatId); return; }
  if (text === '/stats')   { sendStats(chatId); return; }
  if (text === '/categories') {
    bot.sendMessage(chatId, `
💸 هزینه: 🍔 غذا | 🚗 حمل‌ونقل | 🛍️ خرید | 📄 قبوض | 🏥 سلامت | 🎮 تفریح | 🏠 اجاره
💰 درآمد: 💼 حقوق | 💻 فریلنسری | 📈 سرمایه‌گذاری
    `);
    return;
  }
  if (text === '/remind')  { bot.sendMessage(chatId, 'عنوان یادآور را بنویسید:', { reply_markup: { force_reply: true } }); setReminderState(chatId); return; }
  if (text === '/budget')  { bot.sendMessage(chatId, 'نام دسته‌بندی (مثلا food, transport, bills):', { reply_markup: { force_reply: true } }); setBudgetState(chatId); return; }
  if (text === '/goal')    { bot.sendMessage(chatId, 'نام هدف پس‌انداز:', { reply_markup: { force_reply: true } }); setGoalState(chatId); return; }
  if (text === '/clear')  {
    users.delete(String(chatId));
    bot.sendMessage(chatId, '✅ داده‌ها پاک شدند.');
    return;
  }

  // Stateful flows
  const userId = String(chatId);
  const userData = users.get(userId);
  if (!userData?.state) return;

  const state = userData.state;

  // REMINDER FLOW
  if (state.type === 'reminder') {
    if (state.step === 1) {
      bot.sendMessage(chatId, 'مبلغ مرتبط (اختیاری، 0 = بدون مبلغ):', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 2, title: text } });
    } else if (state.step === 2) {
      const amount = parseInt(text) || 0;
      bot.sendMessage(chatId, 'تاریخ (YYYY-MM-DD HH:MM):', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 3, amount } });
    } else if (state.step === 3) {
      const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
      if (!dateMatch) { bot.sendMessage(chatId, '❌ مثال: 2025-02-15 18:00'); return; }
      const reminder = { id: Date.now(), title: state.title, amount: state.amount, date: new Date(text).toISOString(), priority: 'medium', notified: false };
      const existing = users.get(userId) || { transactions: [], reminders: [], budgets: [], goals: [] };
      existing.reminders = [...(existing.reminders || []), reminder];
      users.set(userId, { ...existing, state: null });
      bot.sendMessage(chatId, `🔔 یادآور "${state.title}" تنظیم شد!`);
    }
  }

  // BUDGET FLOW
  if (state.type === 'budget') {
    if (state.step === 1) {
      const validCats = ['food','transport','shopping','bills','health','education','entertainment','rent','other_exp'];
      if (!validCats.includes(text.toLowerCase())) {
        bot.sendMessage(chatId, '❌ دسته‌بندی معتبر نیست.\nلیست: food, transport, shopping, bills, health, education, entertainment, rent');
        return;
      }
      bot.sendMessage(chatId, 'حد ماهانه به تومان:', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 2, category: text.toLowerCase() } });
    } else if (state.step === 2) {
      const limit = parseInt(text);
      if (isNaN(limit) || limit <= 0) { bot.sendMessage(chatId, '❌ عدد معتبر وارد کن.'); return; }
      const existing = users.get(userId) || { transactions: [], reminders: [], budgets: [], goals: [] };
      existing.budgets = (existing.budgets || []).filter(b => b.category !== state.category);
      existing.budgets.push({ id: Date.now(), category: state.category, limit });
      users.set(userId, { ...existing, state: null });
      bot.sendMessage(chatId, `✅ بودجه "${state.category}" → ${limit.toLocaleString()} تومان/ماه`);
    }
  }

  // GOAL FLOW
  if (state.type === 'goal') {
    if (state.step === 1) {
      bot.sendMessage(chatId, 'مبلغ هدف به تومان:', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 2, name: text } });
    } else if (state.step === 2) {
      const target = parseInt(text);
      if (isNaN(target) || target <= 0) { bot.sendMessage(chatId, '❌ عدد معتبر وارد کن.'); return; }
      bot.sendMessage(chatId, 'مبلغ فعلی ذخیره شده (اختیاری):', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 3, target } });
    } else if (state.step === 3) {
      const current = parseInt(text) || 0;
      const existing = users.get(userId) || { transactions: [], reminders: [], budgets: [], goals: [] };
      existing.goals = [...(existing.goals || []), { id: Date.now(), name: state.name, target, current }];
      users.set(userId, { ...existing, state: null });
      bot.sendMessage(chatId, `🎯 هدف "${state.name}" → ${target.toLocaleString()} تومان ثبت شد!`);
    }
  }
});

// ─── CALLBACK QUERIES ─────────────────────────────────────
bot.on('callback_query', (query) => {
  if (!query.data?.startsWith('done_')) return;
  const reminderId = parseInt(query.data.replace('done_', ''));
  const userId = String(query.from.id);
  const data = users.get(userId);
  if (data?.reminders) {
    const r = data.reminders.find(r => r.id === reminderId);
    if (r) r.notified = true;
    users.set(userId, data);
  }
  bot.answerCallbackQuery(query.id);
});

// Web app sync
bot.on('web_app_data', (msg) => {
  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('WebApp synced:', Object.keys(data));
  } catch(e) {}
});

// ─── EXPRESS SERVER ───────────────────────────────────────
const app = express();
app.use(express.json());

// Webhook endpoint for Telegram
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body).substring(0, 200));
    bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.sendStatus(400);
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'hesab-yar-bot' });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🤖 Bot started!`);
  console.log(`📱 Mini App URL: ${APP_URL}`);
  // Set webhook
  try {
    const webhookUrl = `${APP_URL}/webhook/${BOT_TOKEN}`;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await res.json();
    if (data.ok) {
      console.log(`📡 Webhook set: ${webhookUrl}`);
    } else {
      console.error('Webhook setup failed:', data.description);
    }
  } catch (e) {
    console.error('Webhook setup failed:', e.message);
  }
});
