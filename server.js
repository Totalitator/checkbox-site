const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка базы данных
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Database error:', err);
  } else {
    console.log('Connected to SQLite database');
    db.run(`
      CREATE TABLE IF NOT EXISTS checkbox_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_checked BOOLEAN NOT NULL,
        last_change TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_locked BOOLEAN DEFAULT FALSE,
        lock_end TIMESTAMP
      )
    `, () => {
      // Инициализация начального состояния
      db.get("SELECT COUNT(*) as count FROM checkbox_state", (err, row) => {
        if (row.count === 0) {
          db.run("INSERT INTO checkbox_state (is_checked, is_locked) VALUES (FALSE, FALSE)");
        }
      });
    });
  }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// WebSocket сервер
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  // Отправляем текущее состояние при подключении
  sendCurrentState(ws);
});

function sendCurrentState(ws) {
  db.get("SELECT is_checked, is_locked, lock_end FROM checkbox_state WHERE id = 1", (err, row) => {
    if (!err && row) {
      const message = JSON.stringify({
        type: 'state_update',
        isChecked: row.is_checked,
        isLocked: row.is_locked,
        lockEnd: row.lock_end
      });
      if (ws) {
        ws.send(message);
      } else {
        // Отправить всем подключенным клиентам
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      }
    }
  });
}

// API endpoint для получения состояния
app.get('/api/state', (req, res) => {
  db.get("SELECT is_checked, is_locked, lock_end FROM checkbox_state WHERE id = 1", (err, row) => {
    if (err) {
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({
        isChecked: row.is_checked,
        isLocked: row.is_locked,
        lockEnd: row.lock_end
      });
    }
  });
});

// API endpoint для изменения состояния
app.post('/api/toggle', (req, res) => {
  const now = new Date();
  
  // Сначала проверяем текущее состояние
  db.get("SELECT is_checked, is_locked, lock_end FROM checkbox_state WHERE id = 1", (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Проверяем, не заблокирован ли чекбокс
    if (row.is_locked) {
      const lockEnd = new Date(row.lock_end);
      if (now < lockEnd) {
        return res.status(423).json({ 
          error: 'Checkbox is locked', 
          isChecked: row.is_checked,
          isLocked: true,
          lockEnd: row.lock_end 
        });
      }
    }

    // Инвертируем текущее состояние
    const newState = !row.is_checked;
    const lockEnd = new Date(now.getTime() + 60000); // +1 минута

    // Обновляем состояние в базе данных
    db.run(
      "UPDATE checkbox_state SET is_checked = ?, is_locked = TRUE, lock_end = ? WHERE id = 1",
      [newState, lockEnd.toISOString()],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Отправляем обновление всем клиентам
        sendCurrentState();
        
        res.json({ 
          success: true,
          isChecked: newState,
          isLocked: true,
          lockEnd: lockEnd.toISOString()
        });

        // Устанавливаем таймер для автоматической разблокировки
        setTimeout(() => {
          db.run("UPDATE checkbox_state SET is_locked = FALSE WHERE id = 1");
          sendCurrentState();
        }, 60000);
      }
    );
  });
});

// Создаем HTTP сервер
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Подключаем WebSocket к HTTP серверу
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});