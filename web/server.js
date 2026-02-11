/**
 * UniBot Time2Race - MVP Demo
 * Node.js сервер (Express)
 */

const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Конфигурация из env
const PORT = process.env.PORT || 3000;
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://localhost:8000';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ============ ВАЛИДАЦИЯ И НОРМАЛИЗАЦИЯ ============

function toTitleCase(str) {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizePhone(phone) {
  // Убираем всё кроме цифр
  const digits = phone.replace(/\D/g, '');
  
  // Приводим к формату +7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('8')) {
    return '+7' + digits.slice(1);
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return '+' + digits;
  }
  if (digits.length === 10) {
    return '+7' + digits;
  }
  return '+7' + digits.slice(-10); // fallback
}

function validateEmail(email) {
  return email && email.includes('@') && email.includes('.');
}

function validateBirthDate(dateStr) {
  // Ожидаем DD.MM.YYYY
  const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return { valid: false, error: 'Формат даты: ДД.ММ.ГГГГ' };
  
  const [, day, month, year] = match;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  
  if (y < 1900 || y > 2020) return { valid: false, error: 'Год рождения должен быть 1900-2020' };
  if (m < 1 || m > 12) return { valid: false, error: 'Некорректный месяц' };
  if (d < 1 || d > 31) return { valid: false, error: 'Некорректный день' };
  
  return { valid: true, formatted: `${day}.${month}.${year}` };
}

function validate(data) {
  const errors = [];
  
  if (!data.fio || data.fio.trim().length < 3) {
    errors.push('Введите ФИО (минимум 3 символа)');
  }
  if (!data.phone || data.phone.replace(/\D/g, '').length < 10) {
    errors.push('Введите корректный телефон');
  }
  if (!validateEmail(data.email)) {
    errors.push('Введите корректный email');
  }
  if (!data.birth_date) {
    errors.push('Введите дату рождения');
  } else {
    const dateCheck = validateBirthDate(data.birth_date);
    if (!dateCheck.valid) errors.push(dateCheck.error);
  }
  
  return errors;
}

// ============ TELEGRAM ============

async function sendToTelegram(chatId, text, pdfPath, pdfFilename) {
  const botUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  
  // 1. Отправляем текстовое сообщение
  await axios.post(`${botUrl}/sendMessage`, {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  });
  
  // 2. Отправляем PDF как документ
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', fs.createReadStream(pdfPath), pdfFilename);
  form.append('caption', '📄 Анкета клиента');
  
  await axios.post(`${botUrl}/sendDocument`, form, {
    headers: form.getHeaders()
  });
}

// ============ РОУТЫ ============

// Главная страница с формой
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Time2Race - Регистрация</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      width: 100%;
      max-width: 420px;
    }
    h1 {
      color: #333;
      margin-bottom: 8px;
      font-size: 28px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      color: #444;
      font-weight: 500;
      font-size: 14px;
    }
    input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }
    input::placeholder {
      color: #aaa;
    }
    button {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }
    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }
    .error {
      background: #fff5f5;
      border: 1px solid #fc8181;
      color: #c53030;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .success {
      text-align: center;
    }
    .success-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .success h2 {
      color: #38a169;
      margin-bottom: 10px;
    }
    .success p {
      color: #666;
    }
    .request-id {
      background: #f0f0f0;
      padding: 8px 16px;
      border-radius: 6px;
      font-family: monospace;
      margin-top: 15px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="form-section">
      <h1>🏎️ Time2Race</h1>
      <p class="subtitle">Заполните анкету для регистрации</p>
      
      <div id="error-box" class="error" style="display:none;"></div>
      
      <form id="regForm">
        <div class="form-group">
          <label for="fio">ФИО *</label>
          <input type="text" id="fio" name="fio" placeholder="Иванов Иван Иванович" required>
        </div>
        
        <div class="form-group">
          <label for="phone">Телефон *</label>
          <input type="tel" id="phone" name="phone" placeholder="+7 (999) 123-45-67" required>
        </div>
        
        <div class="form-group">
          <label for="email">Email *</label>
          <input type="email" id="email" name="email" placeholder="email@example.com" required>
        </div>
        
        <div class="form-group">
          <label for="birth_date">Дата рождения *</label>
          <input type="text" id="birth_date" name="birth_date" placeholder="ДД.ММ.ГГГГ" required>
        </div>
        
        <button type="submit" id="submitBtn">Отправить заявку</button>
      </form>
    </div>
    
    <div id="success-section" class="success" style="display:none;">
      <div class="success-icon">✅</div>
      <h2>Готово!</h2>
      <p>Администратор получил ваш документ</p>
      <div class="request-id" id="requestId"></div>
    </div>
  </div>
  
  <script>
    // Простая маска для телефона
    document.getElementById('phone').addEventListener('input', function(e) {
      let val = e.target.value.replace(/\\D/g, '');
      if (val.length > 0) {
        if (val[0] === '8') val = '7' + val.slice(1);
        if (val[0] !== '7') val = '7' + val;
        let formatted = '+7';
        if (val.length > 1) formatted += ' (' + val.slice(1, 4);
        if (val.length > 4) formatted += ') ' + val.slice(4, 7);
        if (val.length > 7) formatted += '-' + val.slice(7, 9);
        if (val.length > 9) formatted += '-' + val.slice(9, 11);
        e.target.value = formatted;
      }
    });
    
    // Маска для даты
    document.getElementById('birth_date').addEventListener('input', function(e) {
      let val = e.target.value.replace(/\\D/g, '');
      if (val.length > 2) val = val.slice(0,2) + '.' + val.slice(2);
      if (val.length > 5) val = val.slice(0,5) + '.' + val.slice(5,9);
      e.target.value = val;
    });
    
    // Отправка формы
    document.getElementById('regForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const btn = document.getElementById('submitBtn');
      const errorBox = document.getElementById('error-box');
      
      btn.disabled = true;
      btn.textContent = 'Отправка...';
      errorBox.style.display = 'none';
      
      const formData = {
        fio: document.getElementById('fio').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        birth_date: document.getElementById('birth_date').value
      };
      
      try {
        const response = await fetch('/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.status === 'ok') {
          document.getElementById('form-section').style.display = 'none';
          document.getElementById('success-section').style.display = 'block';
          document.getElementById('requestId').textContent = 'ID заявки: ' + result.request_id;
        } else {
          errorBox.innerHTML = result.errors.join('<br>');
          errorBox.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Отправить заявку';
        }
      } catch (err) {
        errorBox.textContent = 'Ошибка сети. Попробуйте ещё раз.';
        errorBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Отправить заявку';
      }
    });
  </script>
</body>
</html>
  `);
});

// API endpoint для приёма заявки
app.post('/submit', async (req, res) => {
  const requestId = uuidv4().slice(0, 8).toUpperCase();
  
  try {
    // 1. Валидация
    const errors = validate(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ status: 'error', errors });
    }
    
    // 2. Нормализация данных
    const data = {
      fio: toTitleCase(req.body.fio),
      phone: normalizePhone(req.body.phone),
      email: req.body.email.trim().toLowerCase(),
      birth_date: req.body.birth_date.trim(),
      submitted_at: new Date().toISOString(),
      request_id: requestId
    };
    
    // 3. Генерация PDF через Python-сервис
    console.log(`[${requestId}] Генерация PDF...`);
    
    const pdfResponse = await axios.post(
      `${PDF_SERVICE_URL}/generate_pdf`,
      data,
      { responseType: 'arraybuffer' }
    );
    
    // 4. Сохраняем PDF во временный файл
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const safeFio = data.fio.replace(/\s+/g, '_').replace(/[^a-zA-Zа-яА-Я_]/g, '');
    const pdfFilename = `Consent_${safeFio}_${timestamp}.pdf`;
    const pdfPath = path.join(__dirname, '..', 'tmp', pdfFilename);
    
    fs.writeFileSync(pdfPath, pdfResponse.data);
    console.log(`[${requestId}] PDF сохранён: ${pdfFilename}`);
    
    // 5. Отправляем в Telegram
    if (TELEGRAM_BOT_TOKEN && ADMIN_CHAT_ID) {
      const telegramMessage = `
<b>📋 Новая заявка #${requestId}</b>

<b>ФИО:</b> ${data.fio}
<b>Телефон:</b> ${data.phone}
<b>Email:</b> ${data.email}
<b>Дата рождения:</b> ${data.birth_date}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
      `.trim();
      
      await sendToTelegram(ADMIN_CHAT_ID, telegramMessage, pdfPath, pdfFilename);
      console.log(`[${requestId}] Отправлено в Telegram`);
    } else {
      console.log(`[${requestId}] Telegram не настроен, пропускаем отправку`);
    }
    
    // 6. Удаляем временный файл
    fs.unlinkSync(pdfPath);
    
    // 7. Успешный ответ
    res.json({ status: 'ok', request_id: requestId });
    
  } catch (error) {
    console.error(`[${requestId}] Ошибка:`, error.message);
    res.status(500).json({ 
      status: 'error', 
      errors: ['Внутренняя ошибка сервера. Попробуйте позже.'] 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'web' });
});

// Запуск
app.listen(PORT, () => {
  console.log(`🚀 Web server running on http://localhost:${PORT}`);
  console.log(`📄 PDF service: ${PDF_SERVICE_URL}`);
  console.log(`📱 Telegram: ${TELEGRAM_BOT_TOKEN ? 'configured' : 'NOT configured'}`);
});
