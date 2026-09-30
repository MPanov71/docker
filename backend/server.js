const MAX_PAYLOAD_MB = 50; // Лимит на размер передаваемых файлов

const express = require('express');
const cors = require('cors');
//const bodyParser = require('body-parser');


const fs = require('fs').promises;
const path = require('path');
const net = require('net');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: MAX_PAYLOAD_MB * 1024 * 1024 }); // 50 MB лимит

const PORT = process.env.PORT || 3000;
const EXTERNAL_SERVER_HOST = process.env.EXTERNAL_SERVER_HOST || 'localhost';
const EXTERNAL_SERVER_PORT = process.env.EXTERNAL_SERVER_PORT || 1020;

const HEADER_SIZE = 26;
const CHDB = 43;
const CRDB = 44;
const PHPR = 19;
const TRGC = 45;
const TRSC = 46;
const TRRC = 47;
const TRGD = 48;
const GTFB = 49;
const SVFB = 50;
const SRGC = 51;
const SRSC = 52;
const CONS = 25;
const COND = 26;
const CONC = 27;
const CONE = 28;
//const SSHS = 53;                 // Маркер пакета начала SSH-сессии
//const SSHD = 54;                 // Маркер пакета данных в SSH-сессии
//const SSHC = 55;
//const DATL = 12;
const TRRE = 58;        // Маркер пакета для RELAY на роутере
const RFILE = 109;


// Middleware
app.use(cors());
//app.use(bodyParser.json({ limit: `${MAX_PAYLOAD_MB}mb` }));
//app.use(bodyParser.urlencoded({ extended: true, limit: `${MAX_PAYLOAD_MB}mb` }));
app.use(express.json({ limit: `${MAX_PAYLOAD_MB}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${MAX_PAYLOAD_MB}mb` }));
app.use(express.static('public'));

// Логирование всех запросов
app.use((req, res, next) => {
    //console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    //console.log(`${new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Moscow' }).replace('T', ' ')} - ${req.method} ${req.url}`);
    
    next();
});

// Обработка graceful shutdown процесса
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing WebSocket connections');
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: 'session_close', reason: 'server_shutdown' }));
            client.close();
        }
    });
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing WebSocket connections');
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: 'session_close', reason: 'server_shutdown' }));
            client.close();
        }
    });
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Вспомогательные функции для работы с файлами
async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    await fs.chmod(filePath, 0o666);
}

// Функция для создания бинарного заголовка пакета
function createPacketHeader(headerData) {
    const buffer = Buffer.alloc(HEADER_SIZE);
    
    buffer.writeUInt16BE(headerData.prot_type || 0, 0);
    buffer.writeUInt16BE(headerData.packet_type || 0, 2);
    buffer.writeUInt16BE(headerData.src_node || 0, 4);
    buffer.writeUInt16BE(headerData.dst_node || 0, 6);
    buffer.writeUInt16BE(headerData.dst_iface || 0, 8);
    buffer.writeUInt16BE(headerData.src_iface || 0, 10);
    buffer.writeUInt16BE(headerData.src_fd || 0, 12);
    buffer.writeUInt16BE(headerData.dst_fd || 0, 14);
    buffer.writeUInt32BE(headerData.data_len || 0, 16);  // 32-bit!
    buffer.writeUInt16BE(headerData.priority || 0, 20);
    buffer.writeUInt16BE(headerData.ttl || 0, 22);
    buffer.writeUInt16BE(headerData.var || 0, 24);
    
    return buffer;
}
//function createPacketHeader(headerData) {
//    const buffer = Buffer.alloc(HEADER_SIZE);
//    
//    let offset = 0;
//    buffer.writeUInt16LE(headerData.prot_type || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.packet_type || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.src_node || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.dst_node || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.dst_iface || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.src_iface || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.src_fd || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.dst_fd || 0, offset);
//    offset += 2;
//    buffer.writeUInt32LE(headerData.data_len || 0, offset);
//    offset += 4;
//    buffer.writeUInt16LE(headerData.priority || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.ttl || 0, offset);
//    offset += 2;
//    buffer.writeUInt16LE(headerData.var || 0, offset);
//    
//    return buffer;
//}

// Функция для разбора бинарного заголовка пакета
function parsePacketHeader(buffer) {
    if (buffer.length < HEADER_SIZE) {
        throw new Error('Buffer too small for packet header');
    }
    
    // Читаем с явными смещениями — чисто и безопасно
    return {
        prot_type:   buffer.readUInt16BE(0),
        packet_type: buffer.readUInt16BE(2),
        src_node:    buffer.readUInt16BE(4),
        dst_node:    buffer.readUInt16BE(6),
        dst_iface:   buffer.readUInt16BE(8),
        src_iface:   buffer.readUInt16BE(10),
        src_fd:      buffer.readUInt16BE(12),
        dst_fd:      buffer.readUInt16BE(14),
        data_len:    buffer.readUInt32BE(16),  // 32-bit!
        priority:    buffer.readUInt16BE(20),
        ttl:         buffer.readUInt16BE(22),
        var:         buffer.readUInt16BE(24)
    };
}
//function parsePacketHeader(buffer) {
//    if (buffer.length < HEADER_SIZE) {
//        throw new Error('Buffer too small for packet header');
//    }
//    
//    let offset = 0;
//    const header = {
//        prot_type: buffer.readUInt16LE(offset),
//        packet_type: buffer.readUInt16LE(offset + 2),
//        src_node: buffer.readUInt16LE(offset + 4),
//        dst_node: buffer.readUInt16LE(offset + 6),
//        dst_iface: buffer.readUInt16LE(offset + 8),
//        src_iface: buffer.readUInt16LE(offset + 10),
//        src_fd: buffer.readUInt16LE(offset + 12),
//        dst_fd: buffer.readUInt16LE(offset + 14),
//        data_len: buffer.readUInt32LE(offset + 16),
//        priority: buffer.readUInt16LE(offset + 20),
//        ttl: buffer.readUInt16LE(offset + 22),
//        var: buffer.readUInt16LE(offset + 24)
//    };
//    
//    return header;
//}

function parsePacketHeaderDataLength(buffer) {
    if (buffer.length < HEADER_SIZE) {
        throw new Error('Buffer too small for packet header');
    }
    //const data_len = buffer.readUInt32LE(16);
    //return data_len;
    return buffer.readUInt32BE(16);
}

// Основная функция отправки запроса на внешний сервер
function sendToExternalServer(action, data = {}) {
    return new Promise((resolve, reject) => {
        const requestData = {
            action: action,
            ...data
        };
        
        const jsonData = JSON.stringify(requestData);
        const dataBuffer = Buffer.from(jsonData, 'utf8');

        let pType = 0;
        switch (action) {
            case 'check_database':      {pType = CHDB;break}
            case 'create_database':     {pType = CRDB;break}
            case 'get_data':            {pType = PHPR;break}
            case 'get_config':          {pType = TRGC;break}
            case 'save_client_config':  {pType = TRSC;break}
            case 'reset_config':        {pType = TRRC;break}
            case 'get_devices':         {pType = TRGD;break}
            case 'get_firms_branches':  {pType = GTFB;break}
            case 'save_firms_branches': {pType = SVFB;break}
            case 'get_server_config':   {pType = SRGC;break}
            case 'save_server_config':  {pType = SRSC;break}
            case 'relay':               {pType = TRRE;break}
            default: {
                        console.log(`[sendToExternalServer] action=${action}, address=${data.server_address}, port=${data.server_port}`);
                        reject(new Error(`Invalid action "${action}"`));
                        return;
            }
        }
        //console.log(`[sendToExternalServer] action=${action}, address=${data.server_address}, port=${data.server_port}`);

        const header = createPacketHeader({
            packet_type: pType,
            data_len: dataBuffer.length
        });
        
        const packet = Buffer.concat([header, dataBuffer]);
        
        const client = new net.Socket();
        const timeout = 15000;
        
        const timer = setTimeout(() => {
            client.destroy();
            reject(new Error('External server connection timeout'));
        }, timeout);

        let responseBuffer = Buffer.alloc(0);
        let responseDataLength = 0;
        let headerReceived = false;


        // Валидация обязательных параметров
        if (!data.server_address || !data.server_port) {
            console.log(`[sendToExternalServer] action=${action}, address=${data.server_address}, port=${data.server_port}`);
            reject(new Error(`Missing required parameters: server_address and server_port for action "${action}"`));
            return;
        }

        client.connect(data.server_port, data.server_address, () => {
            clearTimeout(timer);
            client.write(packet);
        });

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);

            if (!headerReceived && responseBuffer.length >= HEADER_SIZE) {
                try {
                    responseDataLength = parsePacketHeaderDataLength(responseBuffer.slice(0, HEADER_SIZE));
                    headerReceived = true;
                } catch (error) {
                    client.destroy();
                    reject(new Error(`Error parsing response header: ${error.message}`));
                    return;
                }
            }
            
            if (headerReceived && responseBuffer.length >= HEADER_SIZE + responseDataLength) {
                clearTimeout(timer);
                client.destroy();
                
                try {
                    const jsonData = responseBuffer.slice(HEADER_SIZE, HEADER_SIZE + responseDataLength);
                    const response = JSON.parse(jsonData.toString('utf8'));
                    resolve(response);
                } catch (parseError) {
                    reject(new Error(`Error parsing response JSON: ${parseError.message}`));
                }
            }
        });

        client.on('error', (error) => {
            clearTimeout(timer);
            reject(new Error(`External server connection error: ${error.message}`));
        });

        client.on('close', () => {
            clearTimeout(timer);
            if (!headerReceived) {
                reject(new Error('Connection closed before receiving complete response'));
            }
        });
    });
}

// WebSocket обработка SSH терминала через внешний сервер
//wss.on('connection', (ws, req) => {
//    const url = new URL(req.url, `http://${req.headers.host}`);
//    
//    //console.log('WebSocket connection received');
//    //console.log('Full URL:', url.toString());
//    //console.log('Search params:', Object.fromEntries(url.searchParams));
//
//    const tr = url.searchParams.get('tr');
//    const server_address = url.searchParams.get('server_address');
//    const server_port = url.searchParams.get('server_port');
//    const host = url.searchParams.get('host');
//    const port = parseInt(url.searchParams.get('port')) || 22;
//    const username = url.searchParams.get('username');
//    const password = url.searchParams.get('password');
//
//    // Проверяем наличие обязательных параметров для консольного соединения
//    if (tr && server_address && server_port) {
//        //console.log(`Starting console connection for TR ${tr} to ${server_address}:${server_port}`);
//        handleConsoleConnection(ws, tr, server_address, server_port, host, port, username, password);
//    } else {
//        console.error('Missing required parameters for console connection');
//        ws.close(1008, 'Missing required parameters: tr, server_address, server_port are required');
//    }
//});

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    const tr = url.searchParams.get('tr');
    const server_address = url.searchParams.get('server_address');
    
    // Парсим server_port с валидацией
    const server_port_raw = url.searchParams.get('server_port');
    const server_port = server_port_raw ? parseInt(server_port_raw, 10) : null;
    
    const host = url.searchParams.get('host');
    const port_raw = url.searchParams.get('port');
    const port = port_raw ? parseInt(port_raw, 10) : 22;
    const username = url.searchParams.get('username');
    const password = url.searchParams.get('password');

    // Валидация порта: должен быть числом в диапазоне 0-65535
    const isValidPort = (p) => Number.isInteger(p) && p >= 0 && p < 65536;

    if (tr && server_address && server_port !== null && isValidPort(server_port)) {
        handleConsoleConnection(ws, tr, server_address, server_port, host, port, username, password);
    } else {
        console.error('Missing or invalid required parameters for console connection');
        
        // Формируем понятное сообщение об ошибке
        const errors = [];
        if (!tr) errors.push('tr');
        if (!server_address) errors.push('server_address');
        if (server_port === null) errors.push('server_port (missing)');
        else if (!isValidPort(server_port)) errors.push('server_port (invalid value)');
        
        ws.close(1008, `Missing/invalid parameters: ${errors.join(', ')}`);
    }
});



function handleConsoleConnection(ws, tr, server_address, server_port, host, port, username, password) {
    //console.log('handleConsoleConnection:', { tr, server_address, server_port, host, port, username });
    // Дублирующая валидация для безопасности
    if (!Number.isInteger(server_port) || server_port < 0 || server_port >= 65536) {
        console.error(`Invalid server_port: ${server_port}`);
        ws.close(1011, 'Internal error: invalid server_port');
        return;
    }
    
    const tcpClient = new net.Socket();
    let responseBuffer = Buffer.alloc(0);
    let responseDataLength = 0;
    let headerReceived = false;
    let connectionActive = true;

    // Функция для отправки данных через внешний сервер
    function sendConsoleData(data, packetType = CONC) {  // По умолчанию CONC для данных терминала
        if (!connectionActive || !tcpClient.writable) return;

        let requestData;
        
        if (packetType === CONS) {
            // Для инициализационного пакета отправляем учетные данные
            requestData = {
                type: 'init',
                host,
                port,
                username,
                password
            };
        } else {
            // Для данных терминала отправляем просто данные
            requestData = data.toString();
            //requestData = {
            //    //type: 'data',
            //    data: data.toString()  // Преобразуем Buffer в строку
            //};
        }
        
        const jsonData = JSON.stringify(requestData);
        //console.log('sendConsoleData JSON:', jsonData, 'packetType:', packetType);
        //const dataBuffer = Buffer.from(jsonData, 'utf8');
        const dataBuffer = Buffer.from(jsonData, 'utf8');

        const header = createPacketHeader({
            packet_type: packetType,
            dst_node: parseInt(tr) || 0,
            data_len: dataBuffer.length
        });
        
        const packet = Buffer.concat([header, dataBuffer]);
        tcpClient.write(packet);
    }

    // Функция для отправки resize
    function sendResize(rows, cols) {
        const resizeData = JSON.stringify({
            type: 'resize',
            rows: rows,
            cols: cols
        });
        // Отправляем resize как CONC пакет
        //sendConsoleData(Buffer.from(resizeData), CONC);
    }

    // Установка соединения с внешним сервером
    tcpClient.connect(parseInt(server_port), server_address, () => {
        //console.log(`Connected to external server ${server_address}:${server_port} for console session`);
        tcpClient.setKeepAlive(true, 10000);
        //tcpClient.setTimeout(0); 
        // Отправляем начальный пакет CONS для инициализации консольной сессии
        sendConsoleData(Buffer.from(''), CONS);  // Пустые данные, т.к. учетные данные в JSON
    });

    // Обработка входящих данных от внешнего сервера
    tcpClient.on('data', (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);

        if (!headerReceived && responseBuffer.length >= HEADER_SIZE) {
            try {
                const header = parsePacketHeader(responseBuffer.slice(0, HEADER_SIZE));
                responseDataLength = header.data_len;
                headerReceived = true;

                //console.log(`Received packet type: ${header.packet_type}, data length: ${responseDataLength}`);
                
                // Проверяем тип пакета
                if (header.packet_type === CONE) {
                    //console.log('Received CONE packet - closing connection');
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ type: 'session_close', reason: 'console_closed' }));
                    }
                    connectionActive = false;
                    tcpClient.end();
                    return;
                }
            } catch (error) {
                console.error('Error parsing response header:', error);
                tcpClient.destroy();
                return;
            }
        }
        
        if (headerReceived && responseBuffer.length >= HEADER_SIZE + responseDataLength) {
            try {
                const packetData = responseBuffer.slice(HEADER_SIZE, HEADER_SIZE + responseDataLength);
                
                // Проверяем заголовок пакета для определения типа
                const header = parsePacketHeader(responseBuffer.slice(0, HEADER_SIZE));
                
                //console.log(`Processing packet type: ${header.packet_type}, data length: ${responseDataLength}`);

                if (header.packet_type === COND) {
                    // Данные консоли - отправляем в WebSocket
                    if (ws.readyState === ws.OPEN) {
                        // Пытаемся разобрать как JSON
                        try {
                            const jsonData = JSON.parse(packetData.toString('utf8'));
                            if (jsonData.type === 'data' && jsonData.data) {
                                // Отправляем данные терминалу
                                const terminalData = Buffer.from(jsonData.data);
                                ws.send(terminalData);
                            } else if (jsonData.type === 'error') {
                                console.error('Console error:', jsonData.message);
                                const errorMsg = `\r\n\x1b[31mConsole error: ${jsonData.message}\x1b[0m\r\n`;
                                ws.send(Buffer.from(errorMsg, 'utf8'));
                            }
                        } catch (e) {
                            // Если не JSON, отправляем как бинарные данные
                            //console.log('Sending raw data to terminal');
                            ws.send(packetData);
                        }
                    }
                } else if (header.packet_type === RFILE) {
                    // Обработка пакета с файлом от внешнего сервера
                    //console.log(`Received RFILE packet, data length: ${responseDataLength}`);
                    
                    if (ws.readyState === ws.OPEN) {
                        try {
                            // Пытаемся распарсить как JSON (ожидаем {filename, content, size})
                            const fileData = JSON.parse(packetData.toString('utf8'));
                            
                            ws.send(JSON.stringify({
                                type: 'file_download',
                                filename: fileData.filename || 'downloaded_file',
                                content: fileData.content,  // Base64
                                size: fileData.size || packetData.length
                            }));
                        } catch (e) {
                            // Если не JSON, отправляем как бинарные данные
                            ws.send(JSON.stringify({
                                type: 'file_download',
                                filename: `file_${Date.now()}`,
                                content: packetData.toString('base64'),
                                size: packetData.length
                            }));
                        }
                    }
                } else if (header.packet_type === CONE) {
                    // Закрытие соединения
                    //console.log('Received CONE packet in main processing');
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ type: 'session_close', reason: 'console_closed' }));
                    }
                    connectionActive = false;
                    tcpClient.end();
                }


                
            } catch (error) {
                console.error('Error processing console data:', error);
            } finally {
                // Очищаем буфер для следующего пакета
                responseBuffer = responseBuffer.slice(HEADER_SIZE + responseDataLength);
                headerReceived = false;
                responseDataLength = 0;
                
                // Обрабатываем оставшиеся данные в буфере (могли прийти несколько пакетов)
                if (responseBuffer.length >= HEADER_SIZE) {
                    setTimeout(() => tcpClient.emit('data', Buffer.alloc(0)), 0);
                }
            }
        }
    });

    tcpClient.on('error', (error) => {
        console.error(`Console TCP connection error: ${error.message}`);
        if (ws.readyState === ws.OPEN) {
            const errorMsg = `\r\n\x1b[31mConsole connection error: ${error.message}\x1b[0m\r\n`;
            ws.send(Buffer.from(errorMsg, 'utf8'));
            ws.send(JSON.stringify({ type: 'session_close', reason: 'connection_error' }));
        }
        connectionActive = false;
    });

    tcpClient.on('close', (hadError) => {
        //console.log(`Console TCP connection closed for TR ${tr}`, hadError ? 'with error' : 'normally');
        connectionActive = false;
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'session_close', reason: 'tcp_closed' }));
        }
    });

    // Обработка сообщений от WebSocket (пользовательский ввод)
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'input' && connectionActive) {
                // Отправляем пользовательский ввод как CONC пакет
                sendConsoleData(Buffer.from(msg.data), CONC);
            } else if (msg.type === 'resize' && connectionActive) {
                // Отправляем изменение размера терминала как COND пакет
                sendResize(msg.rows, msg.cols);
            }
            else if (msg.type === 'file_upload' && connectionActive) {// Пришёл файл из web на отправку на сервер
                //console.log(`File upload received: ${msg.filename} (${msg.size} bytes)`);

                    ws.send(`\x1b[32m[Uploading file: ${msg.filename} (${msg.size} bytes)  →  ${msg.destination_path}]\x1b[0m\r\n`);
                
                // Формируем данные для отправки на внешний сервер:
                // "SEND" + путь(имя файла) + содержимое
                const uploadPayload = {
                    command: 'SEND',
                    path: msg.destination_path,  // Полный путь недоступен, только имя
                    filename: msg.filename,
                    size: msg.size,
                    mimetype: msg.mimetype,
                    content: msg.content  // Base64 строка
                };
                
                // Отправляем как CONC пакет
                sendConsoleData(Buffer.from(JSON.stringify(uploadPayload)), CONC);
                
                // Подтверждение пользователю (опционально)
                if (ws.readyState === ws.OPEN) {
                    //ws.send(`\r\n\x1b[32m[File sent: ${msg.filename}]\x1b[0m\r\n`);
                }
            } 
        } catch (error) {
            //console.error('WebSocket message parsing error:', error);
        }
    });

    ws.on('close', () => {
        //console.log(`WebSocket closed for TR ${tr}`);
        // Отправляем пакет CONE для закрытия соединения на внешнем сервере
        if (connectionActive) {
            sendConsoleData(Buffer.from(''), CONE);
        }
        connectionActive = false;
        tcpClient.end();
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for TR ${tr}:`, error);
        connectionActive = false;
        tcpClient.end();
    });
}


// Получение данных серверов
async function getServersData() {
    const hostsFile = '/opt/hosts.db';
    try {
        return await readJsonFile(hostsFile);
    } catch (error) {
        const exampleServers = [
            {
                'name': 'Local Server',
                'id': 'local',
                'address': 'sctms',
                'port': '2011',
                'note': 'Local TCP server'
            }
        ];
        await writeJsonFile(hostsFile, exampleServers);
        return exampleServers;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        external_server: `${EXTERNAL_SERVER_HOST}:${EXTERNAL_SERVER_PORT}`
    });
});

// Serve frontend files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/terminal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terminal.html'));
});

// API Routes
app.get('/api', async (req, res) => {
    try {
        const action = req.query.action;
        
        if (action === 'get_servers') {
            const servers = await getServersData();
            const databases = servers.map(server => ({
                name: server.name,
                id: server.id,
                address: server.address,
                port: server.port,
                note: server.note || ''
            }));
            
            res.json({ databases });
            return;
        }
        
        if (action === 'get_users') {
            const usersFile = '/opt/users.db';
            try {
                const users = await readJsonFile(usersFile);
                res.json({ users });
            } catch (error) {
                res.json({ users: [] });
            }
            return;
        }
        
        const database = req.query.database;
        const server_address = req.query.server_address;
        const server_port = req.query.server_port;
        const router_id = req.query.router_id;
        
        let requestData = {};
        
        if (database) requestData.database = database;
        if (server_address) requestData.server_address = server_address;
        if (server_port) requestData.server_port = server_port;
        if (router_id) requestData.router_id = router_id;

        const response = await sendToExternalServer(action, requestData);
        res.json(response);
        
    } catch (error) {
        console.error('GET API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api', async (req, res) => {
    try {
        const action = req.body.action;
        
        if (action === 'save_servers') {
            const servers = req.body.servers;
            if (!Array.isArray(servers)) {
                res.status(400).json({ error: 'Invalid servers data' });
                return;
            }
            
            const validServers = servers.filter(server => 
                server.name && server.id && server.address && server.port
            ).map(server => ({
                name: server.name.trim(),
                id: server.id.trim(),
                address: server.address.trim(),
                port: server.port.trim(),
                note: server.note ? server.note.trim() : ''
            }));
            
            await writeJsonFile('/opt/hosts.db', validServers);
            res.json({ success: true, message: 'Servers saved successfully' });
            return;
        }
        
        if (action === 'save_users') {
            const users = req.body.users;
            if (!Array.isArray(users)) {
                res.status(400).json({ error: 'Invalid users data' });
                return;
            }
            
            const validUsers = users.filter(user => 
                user.tid && user.name && user.password
            ).map(user => ({
                tid: user.tid.toString().trim(),
                name: user.name.trim(),
                password: user.password.trim(),
                group: user.group ? user.group.trim() : '',
                role: user.role ? user.role.trim() : 'User',
                created_date: user.created_date ? user.created_date.trim() : new Date().toISOString().split('T')[0],
                note: user.note ? user.note.trim() : ''
            }));
            
            await writeJsonFile('/opt/users.db', validUsers);
            res.json({ success: true, message: 'Users saved successfully' });
            return;
        }
        
        const response = await sendToExternalServer(action, req.body);
        res.json(response);
        
    } catch (error) {
        console.error('POST API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.options('/api', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

app.use('*', (req, res) => {
    console.log('404 - Route not found:', req.originalUrl);
    res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
    //console.log(`Server running on port ${PORT}`);
    //console.log(`REST API available at http://0.0.0.0:${PORT}/api`);
    //console.log(`WebSocket available at ws://0.0.0.0:${PORT}/`);
    //console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
    //console.log(`External server: ${EXTERNAL_SERVER_HOST}:${EXTERNAL_SERVER_PORT}`);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});