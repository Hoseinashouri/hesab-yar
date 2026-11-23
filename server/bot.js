require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ BOT_TOKEN is missing! Set it in Render environment variables.');
  process.exit(1);
}

const APP_URL = process.env.APP_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}`;
const PORT = process.env.PORT || 3000;

const users = new Map();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// /start
bot.onText(/\/start/, (msg) => {
  const welcomeMsg = `
👋 سلام! به **حساب‌یار** خوش آمدی!

💰 مدیریت هوشمند مالی تو:
✅ ثبت درآمد و هزینه با دسته‌بندی
✅ یادآوری پرداخت‌ها (مثل قبض، اجاره)
✅ بودجه‌بندی ماهانه برای هر دسته
✅ اهداف پس‌انداز (خرید لپ‌تاپ، مسافرت...)
✅ چند حساب (کیف پول، بانک، اعتباری)

👇 اپ رو باز کن:
  `.trim();

  bot.sendMessage(msg.chat.id, welcomeMsg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 باز کردن حساب‌یار', web_app: { url: APP_URL } }]
      ]
    }
  });
});

// Commands
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `
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
});

bot.onText(/\/balance/, (msg) => {
  const userId = String(msg.chat.id);
  const data = users.get(userId) || { transactions: [], reminders: [] };
  const txns = data.transactions || [];
  const income = txns.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  bot.sendMessage(msg.chat.id, 
    `💰 موجودی: ${income - expense.toLocaleString()} تومان\n📈 درآمد: ${income.toLocaleString()}\n📉 هزینه: ${expense.toLocaleString()}`
  );
});

bot.onText(/\/stats/, (msg) => {
  const userId = String(msg.chat.id);
  const data = users.get(userId) || { transactions: [] };
  const txns = data.transactions || [];
  const count = txns.length;
  const income = txns.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const budgets = data.budgets?.length || 0;
  const goals = data.goals?.length || 0;
  bot.sendMessage(msg.chat.id, 
    `📊 آمار شما:\n تراکنش: ${count}\n بودجه: ${budgets}\n هدف: ${goals}\n یادآور: ${data.reminders?.length || 0}`
  );
});

bot.onText(/\/categories/, (msg) => {
  bot.sendMessage(msg.chat.id, `
💸 هزینه: 🍔 غذا | 🚗 حمل‌ونقل | 🛍️ خرید | 📄 قبوض | 🏥 سلامت | 🎮 تفریح | 🏠 اجاره
💰 درآمد: 💼 حقوق | 💻 فریلنسری | 📈 سرمایه‌گذاری
  `);
});

bot.onText(/\/remind/, (msg) => {
  bot.sendMessage(msg.chat.id, 'عنوان یادآور را بنویسید:', {
    reply_markup: { force_reply: true }
  });
  users.set(msg.chat.id, { state: { type: 'reminder', step: 1 } });
});

bot.onText(/\/budget/, (msg) => {
  bot.sendMessage(msg.chat.id, 'نام دسته‌بندی (مثلا food, transport, bills):', {
    reply_markup: { force_reply: true }
  });
  users.set(msg.chat.id, { state: { type: 'budget', step: 1 } });
});

bot.onText(/\/goal/, (msg) => {
  bot.sendMessage(msg.chat.id, 'نام هدف پس‌انداز:', {
    reply_markup: { force_reply: true }
  });
  users.set(msg.chat.id, { state: { type: 'goal', step: 1 } });
});

bot.onText(/\/clear/, (msg) => {
  users.delete(String(msg.chat.id));
  bot.sendMessage(msg.chat.id, '✅ داده‌ها پاک شدند.');
});

// Reply handler
bot.on('message', (msg) => {
  const userId = String(msg.chat.id);
  const userData = users.get(userId);
  if (!userData?.state) return;

  const text = msg.text?.trim();
  const state = userData.state;

  // REMINDER FLOW
  if (state.type === 'reminder') {
    if (state.step === 1) {
      bot.sendMessage(msg.chat.id, 'مبلغ مرتبط (اختیاری، 0 = بدون مبلغ):', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 2, title: text } });
    } else if (state.step === 2) {
      const amount = parseInt(text) || 0;
      bot.sendMessage(msg.chat.id, 'تاریخ (YYYY-MM-DD HH:MM):', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 3, amount } });
    } else if (state.step === 3) {
      const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
      if (!dateMatch) {
        bot.sendMessage(msg.chat.id, '❌ مثال: 2025-02-15 18:00');
        return;
      }
      const reminder = { id: Date.now(), title: state.title, amount, date: new Date(text).toISOString(), priority: 'medium', notified: false };
      const existing = users.get(userId) || { transactions: [], reminders: [], budgets: [], goals: [] };
      existing.reminders = [...(existing.reminders || []), reminder];
      users.set(userId, { ...existing, state: null });
      bot.sendMessage(msg.chat.id, `🔔 یادآور "${state.title}" تنظیم شد!`);
    }
  }

  // BUDGET FLOW
  if (state.type === 'budget') {
    if (state.step === 1) {
      const validCats = ['food','transport','shopping','bills','health','education','entertainment','rent','other_exp'];
      if (!validCats.includes(text.toLowerCase())) {
        bot.sendMessage(msg.chat.id, '❌ دسته‌بندی معتبر نیست.\nلیست: food, transport, shopping, bills, health, education, entertainment, rent');
        return;
      }
      bot.sendMessage(msg.chat.id, 'حد ماهانه به تومان:', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 2, category: text.toLowerCase() } });
    } else if (state.step === 2) {
      const limit = parseInt(text);
      if (isNaN(limit) || limit <= 0) { bot.sendMessage(msg.chat.id, '❌ عدد معتبر وارد کن.'); return; }
      const existing = users.get(userId) || { transactions: [], reminders: [], budgets: [], goals: [] };
      existing.budgets = (existing.budgets || []).filter(b => b.category !== state.category);
      existing.budgets.push({ id: Date.now(), category: state.category, limit });
      users.set(userId, { ...existing, state: null });
      bot.sendMessage(msg.chat.id, `✅ بودجه "${state.category}" → ${limit.toLocaleString()} تومان/ماه`);
    }
  }

  // GOAL FLOW
  if (state.type === 'goal') {
    if (state.step === 1) {
      bot.sendMessage(msg.chat.id, 'مبلغ هدف به تومان:', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 2, name: text } });
    } else if (state.step === 2) {
      const target = parseInt(text);
      if (isNaN(target) || target <= 0) { bot.sendMessage(msg.chat.id, '❌ عدد معتبر وارد کن.'); return; }
      bot.sendMessage(msg.chat.id, 'مبلغ فعلی ذخیره شده (اختیاری):', { reply_markup: { force_reply: true } });
      users.set(userId, { ...userData, state: { ...state, step: 3, target } });
    } else if (state.step === 3) {
      const current = parseInt(text) || 0;
      const existing = users.get(userId) || { transactions: [], reminders: [], budgets: [], goals: [] };
      existing.goals = [...(existing.goals || []), { id: Date.now(), name: state.name, target, current }];
      users.set(userId, { ...existing, state: null });
      bot.sendMessage(msg.chat.id, `🎯 هدف "${state.name}" → ${target.toLocaleString()} تومان ثبت شد!`);
    }
  }
});

// Web app sync
bot.on('web_app_data', (msg) => {
  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('WebApp synced:', Object.keys(data));
  } catch(e) {}
});

// Express server
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

app.post('/api/sync', (req, res) => {
  const { userId, transactions, reminders, budgets, goals } = req.body;
  users.set(userId, { transactions, reminders, budgets, goals });
  res.json({ ok: true });
});

app.get('/api/data/:userId', (req, res) => {
  res.json(users.get(req.params.userId) || {
    transactions: [], reminders: [], budgets: [], goals: []
  });
});

// Reminder checker (every minute)
setInterval(() => {
  const now = new Date();
  users.forEach((data, userId) => {
    (data.reminders || []).forEach(r => {
      if (!r.notified && new Date(r.date) <= now) {
        r.notified = true;
        bot.sendMessage(parseInt(userId), 
          `🔔 یادآوری!\n${r.title}\n💰 مبلغ: ${r.amount.toLocaleString()} تومان`,
          { reply_markup: { inline_keyboard: [[{ text: '✓ انجام شد', callback_data: `done_${r.id}` }]] }}
        ).catch(() => {});
      }
    });
  });
}, 60000);

app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🤖 Bot started!`);
  console.log(`📱 Mini App URL: ${APP_URL}`);
});
