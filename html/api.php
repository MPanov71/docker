<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Обработка preflight запросов
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? $_GET['action'] ?? '';
} else {
    $action = $_GET['action'] ?? '';
}

//error_log("API Input: " . $input);
error_log("API Request - Method: " . $method . ", Action: " . $action);

switch ($action) {
    case 'get_servers':
        if ($method === 'GET') getServers();
        else sendJsonResponse(['error' => 'Invalid request method for get_servers']);
        break;
        
    case 'save_servers':
        if ($method === 'POST') saveServers($input);
        else sendJsonResponse(['error' => 'Invalid request method for save_servers']);
        break;
        
    case 'get_users':
        if ($method === 'GET') getUsers();
        else sendJsonResponse(['error' => 'Invalid request method for get_users']);
        break;
        
    case 'save_users':
        if ($method === 'POST') saveUsers($input);
        else sendJsonResponse(['error' => 'Invalid request method for save_users']);
        break;
        
    case 'get_data':
        if ($method === 'GET') getData();
        else sendJsonResponse(['error' => 'Invalid request method for get_data']);
        break;

    case 'get_config':
        if ($method === 'GET') getConfig();
        else sendJsonResponse(['error' => 'Invalid request method for get_config']);
        break;

    case 'get_server_config':
        if ($method === 'GET') getServerConfig();
        else sendJsonResponse(['error' => 'Invalid request method for get_server_config']);
        break;

    case 'get_firms_branches':
        if ($method === 'GET') getFirmsAndBranches();
        else sendJsonResponse(['error' => 'Invalid request method for get_firms_branches']);
        break;
        
    case 'get_devices':
        if ($method === 'GET') getDevices();
        else sendJsonResponse(['error' => 'Invalid request method for get_devices']);
        break;
        
    case 'save_firms_branches':
        if ($method === 'POST') saveFirmsAndBranches($input);
        else sendJsonResponse(['error' => 'Invalid request method for save_firms_branches']);
        break;

    case 'reset_config':
        if ($method === 'POST') resetClientConfiguration($input);
        else sendJsonResponse(['error' => 'Invalid request method for reset_config']);
        break;

    case 'save_client_config':
        if ($method === 'POST') saveClientConfiguration($input);
        else sendJsonResponse(['error' => 'Invalid request method for save_client_config']);
        break;

    case 'save_server_config':
        if ($method === 'POST') saveServerConfiguration($input);
        else sendJsonResponse(['error' => 'Invalid request method for save_server_config']);
        break;

    case 'check_database':
        if ($method === 'GET') checkDatabaseExists();
        else sendJsonResponse(['error' => 'Invalid request method for check_database']);
        break;

    case 'create_database':
        if ($method === 'POST') createDatabase($input);
        else sendJsonResponse(['error' => 'Invalid request method for create_database']);
        break;



    default:
        error_log("--> Unknown action: " . $action);    
        sendJsonResponse(['error' => 'Unknown action: ' . $action]);
        break;
}

// Функция для отправки запроса в TCP сервер
function sendToTcpServer($action, $data, $address) {
//function sendToTcpServer($action, $data, $server) {
//    $maxRetries = 3;
//    $retryCount = 1;
//    $address = "tcp://{$server['address']}:{$server['port']}";
    //error_log("get data from address " . $address);
    try {
        error_log("Connecting to TCP server " . $address);
        
        // Устанавливаем таймаут соединения
        $context = stream_context_create([
            'socket' => [
                'connect_timeout' => 10
            ]
        ]);
        
        $client = stream_socket_client($address, $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
        
        if (!$client) {
            throw new Exception("Connection failed: $errstr ($errno)");
        }
        
        // Устанавливаем таймаут чтения/записи
        stream_set_timeout($client, 10);
        
        // Подготовка и отправка запроса
        $request = [
            'action' => $action,
            'data' => $data,
            'timestamp' => time()
        ];
        
        $jsonRequest = json_encode($request) . "\n";
        //error_log("Sending request: " . $jsonRequest);
        
        fwrite($client, $jsonRequest);
        
        // Чтение ответа
        $response = '';
        while (!feof($client)) {
            $buffer = fread($client, 4096);
            if ($buffer === false) break;
            $response .= $buffer;
            if (strpos($buffer, "\n") !== false) break;
        }
        
        fclose($client);
        
        if (empty($response)) {
            throw new Exception('Empty response from TCP server');
        }
        
        $response = trim($response);
//        error_log("Received response: " . $response);
        
        $decodedResponse = json_decode($response, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Invalid JSON response: ' . json_last_error_msg());
        }
        
        return $decodedResponse;
        
    } catch (Exception $e) {
//        error_log("TCP connection error (attempt " . ($retryCount + 1) . "): " . $e->getMessage());
        error_log("TCP connection error: " . $e->getMessage());
        
//        if ($retryCount < $maxRetries) {
//            sleep(1); // Ждем перед повторной попыткой
//            return sendToTcpServer($action, $data, $server, $retryCount + 1);
//        }
    
//        return ['error' => 'TCP connection failed after ' . $maxRetries . ' attempts: ' . $e->getMessage()];
        sleep(5);
        return ['error' => 'TCP connection failed: ' . $e->getMessage()];
    }
}


// Получение данных Firms и Branches 
// Получение Firms и Branches
function getFirmsAndBranches() {
    $database = $_GET['database'] ?? '';
    $address = $_GET['server_address'] ?? '';
    $port = $_GET['server_port'] ?? '';
    //error_log(date('Y-m-d H:i:s') . " API database: " . $database . " ADDRESS: " . $address);
    if (empty($database)) {sendJsonResponse(['error' => 'Server database is required']); return;}
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}

    $response = sendToTcpServer('get_firms_branches', ['database' => $database], "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}// Получение данных Firms и Branches

// Получение Devices
function getDevices() {
    $database = $_GET['database'] ?? '';
    $address = $_GET['server_address'] ?? '';
    $port = $_GET['server_port'] ?? '';

    if (empty($database)) {sendJsonResponse(['error' => 'Server database is required']); return;}
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
      
    $response = sendToTcpServer('get_devices', ['database' => $database], "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Сохранение Firms и Branches через TCP
function saveFirmsAndBranches($input) {
    $address = $input['server_address'] ?? '';
    $port = $input['server_port'] ?? '';
     

    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
    
    $response = sendToTcpServer('save_firms_branches', $input, "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Сброс клиентской конфигурации через TCP
function resetClientConfiguration($input) {
    $address =$input['server_address'] ?? '';
    $port = $input['server_port'] ?? '';
    
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
    
    $response = sendToTcpServer('reset_config', $input, "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Сохранение клиентской конфигурации через TCP
function saveClientConfiguration($input) {
    $address =$input['server_address'] ?? '';
    $port = $input['server_port'] ?? '';
    
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
    
    $response = sendToTcpServer('save_client_config', $input, "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Сохранение серверной конфигурации через TCP
function saveServerConfiguration($input) {
    $address =$input['server_address'] ?? '';
    $port = $input['server_port'] ?? '';
    
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
    
    $response = sendToTcpServer('save_server_config', $input, "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Получение списка серверов (баз данных)
function getServers() {
    $servers = getServersData();
    
    // Преобразуем в формат для веб-интерфейса
    $databases = [];
    foreach ($servers as $server) {
        //error_log("server: " . $server['address']);
        $databases[] = [
            'name' => $server['name'],
            'id' => $server['id'],
            'address' => $server['address'],
            'port' => $server['port'],
            'note' => $server['note'] ?? ''
        ];
    }
            //error_log("databases: " . $databases[1]['address']);
    sendJsonResponse(['databases' => $databases]);
}

// Сохранение серверов
function saveServers($input) {
    if (!isset($input['servers']) || !is_array($input['servers'])) {
        sendJsonResponse(['error' => 'Invalid servers data']);
        return;
    }
    
    $hostsFile = '/opt/hosts.db';
    
    // Валидация данных
    $validServers = [];
    foreach ($input['servers'] as $server) {
        if (isset($server['name']) && isset($server['id']) && 
            isset($server['address']) && isset($server['port'])) {
            $validServers[] = [
                'name' => trim($server['name']),
                'id' => trim($server['id']),
                'address' => trim($server['address']),
                'port' => trim($server['port']),
                'note' => isset($server['note']) ? trim($server['note']) : ''
            ];
        }
    }
    
    // Сохраняем в файл
    $result = file_put_contents($hostsFile, json_encode($validServers, JSON_PRETTY_PRINT));
    
    if ($result === false) {
        sendJsonResponse(['error' => 'Cannot save hosts file']);
        return;
    }
    
    // Устанавливаем правильные права на файл
    chmod($hostsFile, 0666);
    
    sendJsonResponse(['success' => true, 'message' => 'Servers saved successfully']);
}

// Получение пользователей
function getUsers() {
    $usersFile = '/opt/users.db';

    // Если файл не существует, возвращаем пустой массив
    if (!file_exists($usersFile)) {
        sendJsonResponse(['users' => []]);
        return;
    }
    
    $content = file_get_contents($usersFile);
    if ($content === false) {
        sendJsonResponse(['error' => 'Cannot read users file']);
        return;
    }
    
    $users = json_decode($content, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['users' => []]);
        return;
    }
    
    sendJsonResponse(['users' => $users]);
}

// Сохранение пользователей
function saveUsers($input) {
    if (!isset($input['users']) || !is_array($input['users'])) {
        sendJsonResponse(['error' => 'Invalid users data']);
        return;
    }
    
    $usersFile = '/opt/users.db';
    
    // Валидация данных
    $validUsers = [];
    foreach ($input['users'] as $user) {
        if (isset($user['tid']) && isset($user['name']) && isset($user['password'])) {
            $validUsers[] = [
                'tid' => trim($user['tid']),
                'name' => trim($user['name']),
                'password' => trim($user['password']),
                'group' => isset($user['group']) ? trim($user['group']) : '',
                'role' => isset($user['role']) ? trim($user['role']) : 'User',
                'created_date' => isset($user['created_date']) ? trim($user['created_date']) : date('Y-m-d'),
                'note' => isset($user['note']) ? trim($user['note']) : ''
            ];
        }
    }
    
    // Сохраняем в файл
    $result = file_put_contents($usersFile, json_encode($validUsers, JSON_PRETTY_PRINT));
    
    if ($result === false) {
        sendJsonResponse(['error' => 'Cannot save users file']);
        return;
    }
    
    chmod($usersFile, 0666);
    
    sendJsonResponse(['success' => true, 'message' => 'Users saved successfully']);
}

// Получение данных из базы через TCP
function getData() {
    $database = $_GET['database'] ?? '';
    $address = $_GET['server_address'] ?? '';
    $port = $_GET['server_port'] ?? '';

    if (empty($database)) {sendJsonResponse(['error' => 'Server database is required']); return;}
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}

    $response = sendToTcpServer('get_data', ['database' => $database], "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Получение данных для клиентской конфигурации
function getConfig() {
    $database = $_GET['database'] ?? '';
    $routerId = $_GET['router_id'] ?? '';
    $address = $_GET['server_address'] ?? '';
    $port = $_GET['server_port'] ?? '';

    if (empty($database)) {sendJsonResponse(['error' => 'Server database is required']); return;}
    if (empty($routerId)) {sendJsonResponse(['error' => 'Router ID is required']); return;}
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
 
    $response = sendToTcpServer('get_config', ['database' => $database, 'router_id' => $routerId], "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Получение данных для серверной конфигурации 
function getServerConfig() {
    $database = $_GET['database'] ?? '';
    $routerId = $_GET['router_id'] ?? '';
    $address = $_GET['server_address'] ?? '';
    $port = $_GET['server_port'] ?? '';

    if (empty($database)) {sendJsonResponse(['error' => 'Server database is required']); return;}
    if (empty($routerId)) {sendJsonResponse(['error' => 'Router ID is required']); return;}
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}
 
    $response = sendToTcpServer('get_config', ['database' => $database, 'router_id' => $routerId], "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Проверка существования базы данных
function checkDatabaseExists() {
    $database = $_GET['database'] ?? '';
    $address = $_GET['server_address'] ?? '';
    $port = $_GET['server_port'] ?? '';

//    $address = $input['server_address'] ?? '';
//    $port = $input['server_port'] ?? '';
//    $dbName = $input['database'] ?? '';

    //error_log("checkDatabaseExists  server " . $address . " port: " . $port . " name: " . $dbName);
    if (empty($database)) {
        sendJsonResponse(['error' => 'Database name is required']);
        return;
    }
    
//    $dbPath = '/opt/' . $database;
//    $exists = file_exists($dbPath);
//    sendJsonResponse(['exists' => $exists]);

    
    $response = sendToTcpServer('check_database', ['database' => $database], "tcp://{$address}:{$port}");

    sendJsonResponse($response);
}

// Создание новой базы данных SQLite
function createDatabase($input) {
    $address = $input['server_address'] ?? '';
    $port = $input['server_port'] ?? '';
    $database = $input['database'] ?? '';
    //error_log("--------- database: " . $database);

    if (empty($database)) {sendJsonResponse(['error' => 'Server database is required']); return;}
    if (empty($address)) { sendJsonResponse(['error' => 'Server address is required']); return;}
    if (empty($port)) {    sendJsonResponse(['error' => 'Server port is required']); return;}

    $response = sendToTcpServer('create_database', $input, "tcp://{$address}:{$port}");
    
    if (isset($response['error'])) {
        sendJsonResponse(['error' => $response['error']]);
    } else {
        sendJsonResponse($response);
    }
}

// Вспомогательная функция для получения сервера по ID
function getServerById($serverId) {
    $servers = getServersData();
    
    foreach ($servers as $server) {
        if ($server['id'] === $serverId) {
            return $server;
        }
    }
    
    return null;
}

// Вспомогательная функция для получения данных серверов
function getServersData() {
    $hostsFile = '/opt/hosts.db';
  
    // Если файл не существует, создаем пример
    if (!file_exists($hostsFile)) {
        $exampleServers = [
            [
                'name' => 'Local Server',
                'id' => 'local',
                'address' => 'scdbc',
                'port' => '2011',
                'note' => 'Local TCP server'
            ]
        ];
        file_put_contents($hostsFile, json_encode($exampleServers, JSON_PRETTY_PRINT));
        chmod($hostsFile, 0666);
        return $exampleServers;
    }
    
    $content = file_get_contents($hostsFile);
    if ($content === false) {
        return [];
    }
    
    $servers = json_decode($content, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        return [];
    }
    
    return $servers;
}

// Вспомогательная функция для отправки JSON ответа
function sendJsonResponse($data) {
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}
?>