document.addEventListener('DOMContentLoaded', function() {
  const checkbox = document.getElementById('shared-checkbox');
  const timerDisplay = document.getElementById('timer-display');
  const timeLeftElement = document.getElementById('time-left');
  const progressBar = document.getElementById('progress');
  const otherUserMessage = document.getElementById('other-user-message');
  
  let timerInterval;
  let lockEndTime;
  
  // Подключаемся к WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  const socket = new WebSocket(wsUrl);
  
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state_update') {
      updateUI(data.isChecked, data.isLocked, data.lockEnd);
    }
  });
  
  // Получаем начальное состояние
  fetch('/api/state')
    .then(response => response.json())
    .then(data => {
      updateUI(data.isChecked, data.isLocked, data.lockEnd);
    })
    .catch(error => {
      console.error('Error fetching initial state:', error);
    });
  
  // Обработчик изменения чекбокса
checkbox.addEventListener('change', function() {
    // Сохраняем исходное состояние на случай ошибки
    const originalState = checkbox.checked;
    
    fetch('/api/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    .then(response => {
      if (!response.ok) {
        // Если статус не 2xx, возвращаем ошибку
        return response.json().then(err => Promise.reject(err));
      }
      return response.json();
    })
    .then(data => {
      // Обновляем UI с новыми данными от сервера
      updateUI(data.isChecked, data.isLocked, data.lockEnd);
      
      if (data.isLocked) {
        startTimer(data.lockEnd);
      }
    })
    .catch(error => {
      console.error('Error toggling checkbox:', error);
      // Восстанавливаем исходное состояние чекбокса
      checkbox.checked = originalState;
      
      if (error.isLocked) {
        updateUI(error.isChecked, error.isLocked, error.lockEnd);
        showOtherUserMessage();
      }
    });
  });
  
function updateUI(isChecked, isLocked, lockEnd) {
    // Устанавливаем состояние чекбокса
    checkbox.checked = isChecked;
    
    // Проверяем, нужно ли блокировать
    if (isLocked) {
      const now = new Date();
      lockEndTime = new Date(lockEnd);
      
      if (now < lockEndTime) {
        checkbox.disabled = true;
        startTimer(lockEnd);
      } else {
        checkbox.disabled = false;
        stopTimer();
      }
    } else {
      checkbox.disabled = false;
      stopTimer();
    }
    
    // Принудительно обновляем состояние, чтобы избежать расхождений
    if (checkbox.checked !== isChecked) {
      checkbox.checked = isChecked;
    }
  }
  
  function startTimer(endTime) {
    stopTimer(); // Останавливаем предыдущий таймер, если есть
    
    timerDisplay.classList.remove('hidden');
    otherUserMessage.classList.add('hidden');
    
    function updateTimer() {
      const now = new Date();
      const end = new Date(endTime);
      const diff = end - now;
      
      if (diff <= 0) {
        stopTimer();
        checkbox.disabled = false;
        return;
      }
      
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      
      timeLeftElement.textContent = `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
      
      const totalTime = 60 * 1000; // 1 минута
      const elapsed = totalTime - diff;
      const progressPercent = (elapsed / totalTime) * 100;
      
      progressBar.style.width = `${progressPercent}%`;
    }
    
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
  }
  
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerDisplay.classList.add('hidden');
    progressBar.style.width = '0%';
  }
  
  function showOtherUserMessage() {
    otherUserMessage.classList.remove('hidden');
    setTimeout(() => {
      otherUserMessage.classList.add('hidden');
    }, 3000);
  }
});