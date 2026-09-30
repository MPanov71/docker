class ConsoleTerminal {
    constructor() {
        this.term = null;
        this.ws = null;
        this.sessionActive = true;
        this.closeTimer = null;
        this.inputBuffer = ''; // Буфер для накопления ввода
        this.commandHistory = []; // История команд
        this.historyIndex = -1; // Текущая позиция в истории
        this.currentLine = ''; // Текущая отображаемая строка
        
        this.credentials = JSON.parse(sessionStorage.getItem('sshCredentials') || '{}');

        //if (!this.credentials.host || !this.credentials.username) {
        //    this.showError('Error: No SSH credentials found. Please go back to main page.');
        //    return;
        //}

        document.title = `Console ${this.credentials.tr}`;

        this.initializeTerminal();
        this.connect();
        
        window.addEventListener('beforeunload', (event) => {
            if (this.sessionActive && this.ws) {
                this.ws.close();
            }
            if (this.closeTimer) {
                clearTimeout(this.closeTimer);
            }
        });
    }

    initializeTerminal() {
        try {
            if (typeof Terminal === 'undefined') {
                throw new Error('xterm.js not loaded');
            }

            this.term = new Terminal({
                cursorBlink: true,
                scrollback: 1000,
                theme: {
                    background: '#1e1e1e',
                    foreground: '#cccccc',
                    cursor: '#ffffff'
                },
                fontSize: 24, // Увеличенный шрифт
                fontFamily: '"Courier New", monospace',
                allowTransparency: false,
                convertEol: true
            });

            this.term.open(document.getElementById('terminal'));
            
            // Фокусируем курсор на терминале сразу после инициализации
            setTimeout(() => {
                if (this.term && this.term.focus) {
                    this.term.focus();
                }
            }, 100);
            
            this.updateTerminalSize();
            
            this.term.onData((data) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                // Обработка escape-последовательностей (стрелки и т.д.)
                if (data.startsWith('\x1b[')) {
                    this.handleEscapeSequence(data);
                    return;
                }

                // Обработка специальных клавиш
                switch (data) {
                    case '\r': // Enter
                    case '\n': // Enter (альтернативный)
                        this.sendCurrentLine();
                        break;
                    
                    case '\x7f': // Backspace
                        this.handleBackspace();
                        break;
                    
                    case '\x03': // Ctrl+C
                        this.handleCtrlC();
                        break;
                    
                    case '\x04': // Ctrl+D
                        // Игнорируем Ctrl+D в этом режиме
                        break;
                    
                    case '\x1b': // Escape
                        this.clearCurrentLine();
                        break;
                    
                    case '\t': // Tab
                        // Игнорируем Tab или добавляем пробелы в буфер
                        this.inputBuffer += '    ';
                        this.term.write('    ');
                        break;
                    
                    default:
                        // Обычные символы - добавляем в буфер и отображаем, НЕ отправляем
                        if (data >= ' ' && data <= '~') {
                            this.inputBuffer += data;
                            this.term.write(data);
                        }
                        // Остальные символы игнорируем (не отправляем)
                        break;
                }
            });

            // Добавляем обработчик клика на контейнер терминала для фокусировки
            const terminalContainer = document.getElementById('terminal');
            if (terminalContainer) {
                terminalContainer.addEventListener('click', () => {
                    if (this.term && this.term.focus) {
                        this.term.focus();
                    }
                });
            }

            window.addEventListener('resize', () => {
                this.updateTerminalSize();
            });

        } catch (error) {
            console.error('Error initializing terminal:', error);
            this.showError('Error initializing terminal: ' + error.message);
        }
    }

    // Обработка Ctrl+C - закрытие терминала
    handleCtrlC() {
        //console.log('Ctrl+C pressed - closing terminal');
        
        // Отправляем сообщение о закрытии на сервер
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ 
                type: 'close', 
                reason: 'user_request'
            }));
        }
        
        // Показываем сообщение о закрытии
        this.term.write('\r\n\x1b[33mConsole closed by user (Ctrl+C)\x1b[0m\r\n');
        this.term.write('\x1b[33mClosing window in 3 seconds...\x1b[0m\r\n');
        
        // Закрываем WebSocket
        if (this.ws) {
            this.ws.close();
        }
        
        // Устанавливаем флаг неактивной сессии
        this.sessionActive = false;
        
        // Закрываем вкладку через 3 секунды
        this.scheduleTabClose();
    }

    // Обработка escape-последовательностей (стрелки)
    handleEscapeSequence(data) {
        switch (data) {
            case '\x1b[A': // Стрелка вверх
                this.navigateHistory(-1);
                break;
            case '\x1b[B': // Стрелка вниз
                this.navigateHistory(1);
                break;
            case '\x1b[C': // Стрелка вправо - игнорируем
            case '\x1b[D': // Стрелка влево - игнорируем
                break;
            // Не отправляем другие escape-последовательности
        }
    }

    // Навигация по истории команд
    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;

        // Сохраняем текущий ввод если мы в новой команде
        if (this.historyIndex === -1) {
            this.currentLine = this.inputBuffer;
        }

        // Обновляем индекс истории
        if (direction === -1) { // Вверх - более старые команды
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
            }
        } else { // Вниз - более новые команды
            if (this.historyIndex > -1) {
                this.historyIndex--;
            }
        }

        // Получаем команду из истории или текущий ввод
        let command;
        if (this.historyIndex === -1) {
            command = this.currentLine;
        } else {
            command = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
        }

        // Обновляем отображение
        this.updateCurrentLine(command);
    }

    // Обновляет текущую строку в терминале
    updateCurrentLine(newLine) {
        // Очищаем текущую строку
        const currentLength = this.inputBuffer.length;
        if (currentLength > 0) {
            this.term.write('\x1b[' + currentLength + 'D'); // Курсор в начало
            this.term.write('\x1b[0K'); // Очистить до конца строки
        }
        
        // Устанавливаем новое значение
        this.inputBuffer = newLine;
        this.term.write(newLine);
    }

    // Отправка текущей строки
    sendCurrentLine() {
        if (this.inputBuffer.trim() !== '') {
            console.log('SEND line:', this.inputBuffer);
            this.ws.send(this.inputBuffer);
            this.ws.send(JSON.stringify({ 
                type: 'input', 
                data: this.inputBuffer
                //data: this.inputBuffer + '\r\n' 
            }));
            
            // Добавляем в историю (исключаем дубликаты подряд)
            if (this.commandHistory.length === 0 || 
                this.commandHistory[this.commandHistory.length - 1] !== this.inputBuffer) {
                this.commandHistory.push(this.inputBuffer);
                
                // Ограничиваем размер истории
                if (this.commandHistory.length > 100) {
                    this.commandHistory.shift();
                }
            }
        } else {
            // Отправляем пустую строку как просто Enter
            //this.ws.send(JSON.stringify({ 
            //    type: 'input', 
            //    data: '\r\n' 
            //}));
        }
        
        this.term.write('\r\n');
        this.inputBuffer = '';
        this.historyIndex = -1;
        this.currentLine = '';
    }

    // Обработка Backspace
    handleBackspace() {
        if (this.inputBuffer.length > 0) {
            this.inputBuffer = this.inputBuffer.slice(0, -1);
            this.term.write('\b \b');
        }
    }

    // Очистка текущей строки
    clearCurrentLine() {
        const currentLength = this.inputBuffer.length;
        if (currentLength > 0) {
            this.term.write('\x1b[' + currentLength + 'D'); // Курсор в начало
            this.term.write('\x1b[0K'); // Очистить до конца строки
        }
        this.inputBuffer = '';
    }

    updateTerminalSize() {
        if (!this.term) return;
        
        const container = document.getElementById('terminal');
        if (!container) return;
        
        const cols = Math.max(40, Math.floor((container.clientWidth - 20) / 9)); // Учли увеличенный шрифт
        const rows = Math.max(10, Math.floor((container.clientHeight - 20) / 19)); // Учли увеличенный шрифт
        
        this.term.resize(cols, rows);
        this.sendResize();
    }

    connect(credentials) {
        const params = new URLSearchParams({
            host: this.credentials.host,
            port: this.credentials.port,
            username: this.credentials.username,
            tr: this.credentials.tr,
            server_address: this.credentials.server_address,
            server_port: this.credentials.server_port,
            password: this.credentials.password
        });
        
        const wsUrl = `ws://${window.location.host}/ws?${params.toString()}`;
        
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('WebSocket connection opened');
            if (this.term) {
                this.term.write('\r\n\x1b[32mConsole connected to router ' + this.credentials.tr + '. Type commands and press Enter to send.\x1b[0m\r\n');
                this.term.write('\x1b[32mPress Ctrl+C to close console\x1b[0m\r\n\r\n');
                
                // Фокусируем курсор после установки соединения
                setTimeout(() => {
                    if (this.term && this.term.focus) {
                        this.term.focus();
                    }
                }, 100);
            }
            this.sendResize();
        };

        this.ws.onmessage = (event) => {
            //console.log('WebSocket message received');
            try {
                if (!this.term) return;

                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        
                        // Обработка команды закрытия сессии
                        if (msg.type === 'session_close') {
                            console.log('Session close received:', msg.reason);
                            this.handleSessionClose(msg.reason);
                            return;
                        }
                    } catch (e) {
                        // Обычный текст
                        //console.log('String data received');
                        this.term.write(event.data);
                    }
                } else {
                    // Бинарные данные
                    //console.log('Binary data received');
                    const data = new Uint8Array(event.data);
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(data);
                    this.term.write(text);
                    
                    // После получения данных от сервера убедимся, что курсор активен
                    setTimeout(() => {
                        if (this.term && this.term.focus) {
                            this.term.focus();
                        }
                    }, 10);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (this.term) {
                this.term.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket connection closed:', event.code, event.reason);
            // Не показываем сообщение о неожиданном закрытии, если сессия уже неактивна
            // (например, при закрытии по Ctrl+C)
            if (this.term && this.sessionActive) {
                this.term.write('\r\n\x1b[33mConnection closed unexpectedly\x1b[0m\r\n');
                this.scheduleTabClose();
            }
        };
    }

    handleSessionClose(reason) {
        console.log('Handling session close, reason:', reason);
        this.sessionActive = false;
        
        let message = '\r\n\x1b[33mSSH session closed';
        
        switch(reason) {
            case 'ssh_stream_closed':
                message += ' (SSH stream closed)';
                break;
            case 'shell_exit':
                message += ' (shell exited)';
                break;
            case 'connection_error':
                message += ' (connection error)';
                break;
            case 'ssh_ended':
                message += ' (SSH ended)';
                break;
            case 'ssh_closed':
                message += ' (SSH connection closed)';
                break;
            default:
                message += ` (${reason})`;
        }
        
        message += '\x1b[0m\r\n';
        message += '\x1b[36mClosing console in 3 seconds...\x1b[0m\r\n';
        
        if (this.term) {
            this.term.write(message);
        }
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        
        this.scheduleTabClose();
    }

    scheduleTabClose() {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
        }
        
        this.closeTimer = setTimeout(() => {
            this.closeTab();
        }, 3000);
    }

    closeTab() {
        console.log('Attempting to close tab...');
        
        try {
            if (window.opener && !window.opener.closed) {
                console.log('Closing tab with window.close()');
                window.close();
            } else {
                console.log('Cannot close tab automatically, showing manual close message');
                this.showManualCloseMessage();
            }
        } catch (error) {
            console.error('Error closing tab:', error);
            this.showManualCloseMessage();
        }
    }

    showManualCloseMessage() {
        if (this.term) {
            this.term.write('\r\n\x1b[35mPlease close this tab manually.\x1b[0m\r\n');
        } else {
            document.body.innerHTML = `
                <div style="color: #cccccc; background: #1e1e1e; height: 100vh; display: flex; justify-content: center; align-items: center; flex-direction: column; font-family: monospace;">
                    <h2 style="color: #569cd6;">Console Session Closed</h2>
                    <p>You can safely close this tab.</p>
                    <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #0e639c; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Close Tab
                    </button>
                </div>
            `;
        }
    }

    sendResize() {
        if (this.term && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const cols = this.term.cols;
            const rows = this.term.rows;
            
            this.ws.send(JSON.stringify({ 
                type: 'resize', 
                rows: rows || 24,
                cols: cols || 80
            }));
        }
    }

    showError(message) {
        document.getElementById('terminal').innerHTML = 
            `<div style="color: #ff6b6b; padding: 20px; font-family: monospace; font-size: 16px;">${message}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ConsoleTerminal();
});