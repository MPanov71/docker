// terminal.js — подключается в terminal.html

//import { Terminal } from 'xterm/xterm.js';
//import { FitAddon } from 'xterm/xterm-addon-fit.min.js';

// Создаём терминал
const terminal = new Terminal({
  fontFamily: 'monospace',
  fontSize: 14,
  theme: {
    background: '#000',
    foreground: '#fff',
  },
});

// Добавляем аддон для автоподгонки размера под окно
const FitAddonClass = window.FitAddon.FitAddon;
const fitAddon = new FitAddonClass();

terminal.loadAddon(fitAddon);

// Подключаем к DOM
terminal.open(document.getElementById('terminal-container'));
fitAddon.fit();

// Приветствие
terminal.writeln('Добро пожаловать в терминал!');
terminal.write('\r\n> ');

// Флаг для отслеживания активного ввода
let inputBuffer = '';

// Обработка ввода
terminal.onData((data) => {
  // Обработка Ctrl+C (код 0x03)
  if (data === '\x03') {
    terminal.writeln('\r\nЗавершение работы...');
    setTimeout(() => {
      window.close();
    }, 3000);
    return;
  }

  // Отображаем введённые символы (кроме управляющих, кроме Enter)
  if (data === '\r') {
    // Enter — завершаем строку
    terminal.writeln('');
    inputBuffer = '';
    terminal.write('> ');
  } else if (data === '\x7f' || data === '\b') {
    // Backspace
    if (inputBuffer.length > 0) {
      inputBuffer = inputBuffer.slice(0, -1);
      terminal.write('\b \b');
    }
  } else if (data.length === 1 && data >= ' ') {
    // Печатаемые символы
    inputBuffer += data;
    terminal.write(data);
  }
  // Игнорируем остальные управляющие символы
});

// Подгоняем терминал при изменении размера окна
window.addEventListener('resize', () => {
  fitAddon.fit();
});