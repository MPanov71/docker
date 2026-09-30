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

            
            // Добавляем аддон для автоподгонки размера под окно
            const FitAddonClass = window.FitAddon.FitAddon;
            const fitAddon = new FitAddonClass();
            
            this.term.loadAddon(fitAddon);
            
            // Подключаем к DOM
            this.term.open(document.getElementById('terminal-container'));
            fitAddon.fit();

            // Фокусируем курсор на терминале сразу после инициализации
            setTimeout(() => {
                if (this.term && this.term.focus) {
                    this.term.focus();
                }
            }, 100);
            
            //this.updateTerminalSize();
            
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
                    
                    //case '\x03': // Ctrl+C
                    //    this.handleCtrlC();
                    //    break;
                    
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


            // Обработка комбинаций клавиш с модификаторами
            this.term.onKey((event) => {
                const { key, domEvent } = event;
                // Alt + S (левый или правый Alt)
                if (domEvent.altKey && domEvent.key.toLowerCase() === 's') {
                    domEvent.preventDefault();
                    this.handleFileUpload();
                    return;
                }
                // Alt + C (левый или правый Alt)
                if (domEvent.altKey && domEvent.key.toLowerCase() === 'c') {
                    domEvent.preventDefault();
                    this.handleCtrlC();
                    return;
                }

                // Ctrl + C — копирование выделенного текста
                if (domEvent.ctrlKey && domEvent.key.toLowerCase() === 'c') {
                    // Если есть выделенный текст — копируем
                    const selection = this.term.getSelection();
                    if (selection) {
                        //domEvent.preventDefault();
                        navigator.clipboard.writeText(selection).then(() => {
                            //this.term.write('\r\n\x1b[33m[Text copied to clipboard]\x1b[0m\r\n');
                        }).catch(err => {
                            console.error('Copy failed:', err);
                        });
                    }
                    // Если нет выделения — отправляем символ Ctrl+C на сервер (как обычную команду)
                    else {
                        // Отправляем \x03 на сервер как обычный ввод
                        //if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        //    this.ws.send(JSON.stringify({
                        //        type: 'input',
                        //        data: '\x03'
                        //    }));
                        //    this.term.write('^C');
                        //}
                    }
                    return;
                }
            
                // Ctrl + V — вставка из буфера обмена
                if (domEvent.ctrlKey && domEvent.key.toLowerCase() === 'v') {
                    //domEvent.preventDefault();
                    navigator.clipboard.readText().then(text => {
                        if (text) {
                            // Вставляем текст в терминал
                            this.inputBuffer += text;
                            this.term.write(text);
                        }
                    }).catch(err => {
                        console.error('Paste failed:', err);
                        //this.term.write('\r\n\x1b[31m[Paste failed]\x1b[0m\r\n');
                    });
                    return;
                }

            });// end this.term.onKey((event) =>

            // Подгоняем терминал при изменении размера окна
            window.addEventListener('resize', () => {
              fitAddon.fit();
            });

        } catch (error) {
            console.error('Error initializing terminal:', error);
            this.showError('Error initializing terminal: ' + error.message);
        }
    }// end InitializeTerminal


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
            //this.ws.send(this.inputBuffer);
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
        
        //const wsUrl = `ws://${window.location.host}/ws?${params.toString()}`;
        // Динамический выбор протокола http или https
        const wsUrl = `${window.location.protocol.replace('http', 'ws')}//${window.location.host}/ws?${params.toString()}`;
        
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('WebSocket connection opened');
            if (this.term) {
                this.term.write('\r\n\x1b[32mConsole connected to router ' + this.credentials.tr + '. Type commands and press Enter to send.\x1b[0m\r\n');
                this.term.write('\x1b[32mPress Alt+C to close console\x1b[0m\r\n\r\n');
                
                // Фокусируем курсор после установки соединения
                setTimeout(() => {
                    if (this.term && this.term.focus) {
                        this.term.focus();
                    }
                }, 100);
            }
            //this.sendResize();
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

                        // ОБработка получения файла 
                        if (msg.type === 'file_download') {
                            console.log('File download received:', msg.filename);
                            this.handleFileDownload(msg);
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



    // Запускает процесс загрузки файла: выбор + ввод пути + отправка
    handleFileUpload() {
        // Шаг 1: выбор файла
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        
        fileInput.onchange = (event) => {
        //console.log('handleFileUpload 1');        
            const file = event.target.files[0];
            if (!file) {
                this.term.write('\r\n\x1b[33m[Upload cancelled]\x1b[0m\r\n');
                return;
            }
        //console.log('handleFileUpload 2');        
            
            // Шаг 2: запрашиваем путь у пользователя через prompt
            // По умолчанию предлагаем только имя файла, пользователь может изменить
            //const defaultPath = file.name;
            const defaultPath = "";

            this.showPathDialog(defaultPath, (userPath) => {
                if (userPath === null) {
                    this.term.write('\r\n\x1b[33m[Upload cancelled]\x1b[0m\r\n');
                    return;
                }
                // ... дальнейшая логика отправки
                const destinationPath = userPath.trim() || defaultPath;

                // Индикация
                //this.term.write(`\r\n\x1b[36m[Uploading: ${file.name} → ${destinationPath}]\x1b[0m\r\n`);

                //Шаг 3: читаем файл
                const reader = new FileReader();
                reader.onload = (e) => {
                    const arrayBuffer = e.target.result;
                    const base64Content = this.arrayBufferToBase64(arrayBuffer);
                    console.log('sending...');
                    
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        // Отправляем на сервер: файл + путь назначения
                        this.ws.send(JSON.stringify({
                            type: 'file_upload',
                            filename: file.name,
                            destination_path: destinationPath,  // Путь, который укажет пользователь
                            size: file.size,
                            mimetype: file.type || 'application/octet-stream',
                            content: base64Content
                        }));
                    }
                };
                reader.onerror = () => {
                    this.term.write(`\r\n\x1b[31m[Error reading file]\x1b[0m\r\n`);
                };
                reader.readAsArrayBuffer(file);


            });
            
        };
        
        // Открываем диалог выбора файла
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);

    }
  
    // Показывает модальное окно для ввода пути (альтернатива prompt)
    showPathDialog(defaultValue, callback) {
        // Создаём оверлей
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        // Создаём модальное окно
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #2d2d2d; border: 1px solid #555; border-radius: 8px;
            padding: 20px; min-width: 400px; max-width: 90%;
            font-family: monospace; color: #ccc;
        `;
        
        modal.innerHTML = `
            <div style="margin-bottom: 15px; color: #569cd6;">
                Enter destination path on server:
            </div>
            <input type="text" id="upload-path-input" value="${defaultValue}" 
                   style="width: 100%; padding: 8px; background: #1e1e1e; 
                          border: 1px solid #555; color: #ccc; font-family: monospace;">
            <div style="margin-top: 15px; text-align: right;">
                <button id="upload-cancel" style="
                    padding: 8px 16px; margin-right: 10px;
                    background: #555; color: white; border: none; 
                    border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="upload-confirm" style="
                    padding: 8px 16px; background: #0e639c; color: white; 
                    border: none; border-radius: 4px; cursor: pointer;">Upload</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Фокус на поле ввода
        setTimeout(() => {
            const input = document.getElementById('upload-path-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
        
        // Обработчики
        const confirm = () => {
            const path = document.getElementById('upload-path-input').value;
            document.body.removeChild(overlay);
            callback(path !== undefined ? path : null);
        };
        
        document.getElementById('upload-confirm').onclick = confirm;
        document.getElementById('upload-cancel').onclick = () => {
            document.body.removeChild(overlay);
            callback(null);
        };
        
        // Enter = подтвердить, Escape = отмена
        document.getElementById('upload-path-input').onkeydown = (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                callback(null);
            }
        };
        
        // Клик вне окна = отмена
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                callback(null);
            }
        };
    }


    // Конвертирует ArrayBuffer в Base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    

    // Форматирует размер файла
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Обработка скачивания файла от сервера
    handleFileDownload(fileData) {
        console.log('File download received:', fileData.filename, fileData.size);

            try {
                // Декодируем Base64 содержимое
                const binaryString = atob(fileData.content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Создаём Blob
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                
                // Создаём ссылку для скачивания
                const a = document.createElement('a');
                a.href = url;
                a.download = fileData.filename;
                document.body.appendChild(a);
                a.click();
                
                // Очищаем
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
                
                this.term.write(`\x1b[32m[File saved: ${fileData.filename} (${this.formatFileSize(fileData.size)})]\x1b[0m\r\n`);
                
            } catch (error) {
                console.error('Download error:', error);
                this.term.write(`\r\n\x1b[31m[Download error: ${error.message}]\x1b[0m\r\n`);
            }

/*        
        // Показываем диалог подтверждения
        this.showDownloadDialog(fileData.filename, (confirmed, newFilename) => {
            if (!confirmed) {
                this.term.write('\r\n\x1b[33m[Download cancelled]\x1b[0m\r\n');
                return;
            }
            
            const filename = newFilename || fileData.filename;
            
            try {
                // Декодируем Base64 содержимое
                const binaryString = atob(fileData.content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Создаём Blob
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                
                // Создаём ссылку для скачивания
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                
                // Очищаем
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
                
                this.term.write(`\x1b[32m[File saved: ${filename} (${this.formatFileSize(fileData.size)})]\x1b[0m\r\n`);
                
            } catch (error) {
                console.error('Download error:', error);
                this.term.write(`\r\n\x1b[31m[Download error: ${error.message}]\x1b[0m\r\n`);
            }
        });
*/        
    }

    // Показывает диалог подтверждения скачивания файла
    showDownloadDialog(defaultFilename, callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #2d2d2d; border: 1px solid #555; border-radius: 8px;
            padding: 20px; min-width: 400px; max-width: 90%;
            font-family: monospace; color: #ccc;
        `;
        
        modal.innerHTML = `
            <div style="margin-bottom: 15px; color: #569cd6;">
                Save file from server:
            </div>
            <input type="text" id="download-filename-input" value="${defaultFilename}" 
                  style="width: 100%; padding: 8px; background: #1e1e1e; 
                         border: 1px solid #555; color: #ccc; font-family: monospace;">
            <div style="margin-top: 15px; text-align: right;">
                <button id="download-cancel" style="
                    padding: 8px 16px; margin-right: 10px;
                    background: #555; color: white; border: none; 
                    border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="download-save" style="
                    padding: 8px 16px; background: #0e639c; color: white; 
                    border: none; border-radius: 4px; cursor: pointer;">Save</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            const input = document.getElementById('download-filename-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
        
        const confirm = () => {
            const filename = document.getElementById('download-filename-input').value;
            document.body.removeChild(overlay);
            callback(true, filename);
        };
        
        document.getElementById('download-save').onclick = confirm;
        document.getElementById('download-cancel').onclick = () => {
            document.body.removeChild(overlay);
            callback(false, null);
        };
        
        document.getElementById('download-filename-input').onkeydown = (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                callback(false, null);
            }
        };
        
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                callback(false, null);
            }
        };
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
        this.term.write('\r\n\x1b[33mConsole closed by user (Alt+C)\x1b[0m\r\n');
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

    showError(message) {
        document.getElementById('terminal').innerHTML = 
            `<div style="color: #ff6b6b; padding: 20px; font-family: monospace; font-size: 16px;">${message}</div>`;
    }

}// end class ConsoleTermiinal


document.addEventListener('DOMContentLoaded', () => {
    new ConsoleTerminal();
});

