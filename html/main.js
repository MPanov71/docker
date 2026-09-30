let UserRole;
let UserGroup;
let currentTMS = null;
let TMSs = [];
let refreshInterval;

// Проверка авторизации
function checkAuth() {
    // Получаем пользователя из sessionStorage
    const savedUser = sessionStorage.getItem('currentUser');
    
    if (!savedUser) {
        console.log('❌ Пользователь не авторизован, перенаправление на страницу входа');
        window.location.href = 'index.html';
        return null;
    }
    
    try {
        const user = JSON.parse(savedUser);
        console.log('✅ Пользователь авторизован:', user.name);
        return user;
    } catch (e) {
        console.error('❌ Ошибка парсинга пользователя:', e);
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return null;
    }
}

// Выбор хоста TMS из списка
function selectTMS(){
    var fieldEl = document.getElementById("tms_selector");
    var filterVal = fieldEl.options[fieldEl.selectedIndex].value;

    table.clearData();
    if ( filterVal === 'Эталонные' ) {
    //console.log('✅ Current TMS before ', TMSs);
        // Добавим список эталонных
        var element = document.getElementById("client_selector_block");
        element.insertAdjacentHTML("afterbegin", `
                <div id="client_selector_block">
                <select id="client_selector" style="font-size: 16px; min-height: 30px; margin: 5px; min-width: 150px; border: 2px solid black; border-width: 2px;">
                </select>
                </div>
        `);
        document.getElementById("client_selector").addEventListener("change", selectClientTMS);
        // Заполним список эталонных
        const select = document.getElementById('client_selector');
        TMSs.forEach(db => {
            const option = document.createElement('option');
            option.textContent = db.id;
            option.value = db.id;
            option.setAttribute('data-server', JSON.stringify(db));
            select.appendChild(option);
        });   
        // Загрузим выбранную эталонную базу
        element = document.getElementById("client_selector");
        const selectedOption = element.options[element.selectedIndex];
        if (selectedOption && selectedOption.getAttribute('data-server'))  currentTMS = JSON.parse(selectedOption.getAttribute('data-server'));
        loadData(currentTMS);
    } else {
        element = document.getElementById("client_selector");
        if ( element ) element.remove();
        TMSs.forEach(tms => {
            if ( tms.id === filterVal ) currentTMS = tms;
        });    
        loadData(currentTMS);
    }
}// end function selectTMS(){

// Выбор клиентской (эталонной) базы в TMS SoftCase
function selectClientTMS(){
        // Загрузим выбранную эталонную базу
        //element = document.getElementById("client_selector");
        //const selectedOption = element.options[element.selectedIndex];
        //if (selectedOption && selectedOption.getAttribute('data-server'))  currentTMS = JSON.parse(selectedOption.getAttribute('data-server'));
        //currentTMS.address = 'sctms';  // Для эталонных баз сервер поменяем на локальный
        //loadData(currentTMS);    


        const element = document.getElementById("client_selector");
        const selectedOption = element.options[element.selectedIndex];
        if (selectedOption && selectedOption.getAttribute('data-server')) {
            currentTMS = JSON.parse(selectedOption.getAttribute('data-server'));
        }
        
        // Гарантируем, что address и port существуют
        if (!currentTMS) {
            console.error("TMS object not found in selector");
            return;
        }
        
        currentTMS.address = 'sctms'; 
        // Если порт пришёл строкой, приводим к числу/строке явно
        currentTMS.port = String(currentTMS.port).trim();
        
        loadData(currentTMS);


}// end function selectClientTMS(){

// Загрузка данных из выбранной базы
function loadData(tms) {
    if (!tms || !tms.id) {
        console.error('No TMS selected');
        return;
    }
    //console.log('✅ Load data for TMS ', tms);
    //console.log('Loading data for TMS:', tms.id);
    
    // Сохраняем текущее состояние таблицы
    const currentPage = table.getPage();
    const selectedRows = table.getSelectedData();
    
    fetch(`/api?action=get_data&database=${tms.id}.db&server_address=${tms.address}&server_port=${tms.port}`)
        .then(response => response.json())
        .then(data => {
            //console.log('data:', data.error);
            if (data.error) {
                console.log('Error loading data:' + data.error);
            } else {
                //console.log('data:' + data.data);
                table.setData(data.data || []);
                restoreTableState(currentPage, selectedRows);
                element = document.getElementById("TotalCount");
                element.textContent = "Количество: "+table.getDataCount("active");
//                updateStats(data.data || []);
                startAutoRefresh();
            }
        })
        .catch(error => {
            console.error('Connection error: ' + error.message);
        });
}

// Обновление списка групп (для формы добавления пользователей)
function updateGroupsList() {
    const groupSelect = document.getElementById('group-field');
//    groupSelect.innerHTML = '<option value="">Группа</option>';
    // Сначала очистим список
    while ( !!groupSelect && !!groupSelect.options[0] ) groupSelect.options[0].remove();
    
    // Теперь наполним его
    TMSs.forEach(db => {
            const option = document.createElement('option');
            option.value = db.id; // Используем ID без .db
            option.textContent = db.name;
            groupSelect.appendChild(option);
    });
}

// Сохранение серверов
function saveTMSs() {
    const serversData = TMSTable.getData();
    
    const postData = {
        action: 'save_servers',
        servers: serversData
    };
    
    fetch('/api', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Серверы успешно сохранены');
            loadTMSlist();
        } else {
            alert('Ошибка при сохранении серверов: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error saving TMSs:', error);
        alert('Ошибка при сохранении серверов: ' + error.message);
    });
}

// Загрузка списка серверов
function loadTMSlist() {
    fetch('/api?action=get_servers')
        .then(response => response.json())
        .then(data => {
            if (data.databases && data.databases.length > 0) {
                TMSs = data.databases;
                //console.log('✅ TMSs ', TMSs);
                TMSTable.setData(TMSs);


                if ( UserGroup === 'sc') {
                    if ( currentTMS && currentTMS.id ) {
                        //console.log('currentTMS: ', currentTMS);
                    } else {// Если нет текущего TMS, значит надо сформировать список ТМС и эталонов
                        var select = document.getElementById('tms_selector');
                        select.innerHTML = '<option value="Эталонные">Эталонные</option>';                    
                        TMSs.forEach(db => {
                            const option = document.createElement('option');
                            option.textContent = db.name;
                            option.value = db.id;
                            option.setAttribute('data-server', JSON.stringify(db));
                            select.appendChild(option);
                        });

                        select = document.getElementById('client_selector');
                        TMSs.forEach(db => {
                            const option = document.createElement('option');
                            option.textContent = db.id;
                            option.value = db.id;
//                            var newdb = [];
//                            newdb.name = db.name;
//                            newdb.id = db.id;
//                            newdb.address = 'sctms';  // Для эталонных баз сервер поменяем на локальный
//                            newdb.port = db.port;
//                            newdb.note = db.note;
                            //console.log('✅ db ', db);
//                            console.log('✅ newdb ', newdb);
//                            option.setAttribute('data-server', JSON.stringify(newdb));
                            option.setAttribute('data-server', JSON.stringify(db));
                            select.appendChild(option);
                        });
                //console.log('✅ loadTMSlist ', TMSs);
                    
                        //console.log('select currentTMS: ', currentTMS);
                        selectClientTMS();
                    }
                } else {// Если залогинился пользователь не из SoftCase, то загрузим его базу
                    //var ct = currentTMS;
                    //TMSs.forEach(tms => {if ( tms.id === ct ) currentTMS = tms;});    
                    //loadData(currentTMS);
                    // Ищем TMS по ID, игнорируя возможное расширение .db
                    const foundTMS = TMSs.find(tms => 
                        tms.id === currentTMS || tms.id + '.db' === currentTMS
                    );
                    
                    if (foundTMS) {
                        currentTMS = foundTMS;
                        loadData(currentTMS);
                    } else {
                        console.error('❌ Не удалось найти конфигурацию сервера для группы:', currentTMS);
                        alert('Ошибка конфигурации: сервер не найден. Обратитесь к администратору.');
                    }




                }

/*
                databases.forEach(db => {
                    const option = document.createElement('option');
                    option.textContent = db.name;
                    option.value = db.id;
                    option.setAttribute('data-server', JSON.stringify(db));
                    select.appendChild(option);
                });

                // Автоматически выбираем первый сервер
                if (databases.length > 0) {
                    select.value = databases[0].id;
                    currentTMS = databases[0];
                    loadData(currentTMS);
                }
*/                
//                updateGroupsList();
                
            } else {
//                select.innerHTML = '<option value="">No TMS found</option>';
                console.error('Loading TMS: No TMS found');
            }
        })
        .catch(error => {
            console.error('Error loading TMSs:', error);
            document.getElementById('database-select').innerHTML = '<option value="">Error loading TMSs</option>';
        });
}

  // Показ всех роутеров в базе
function ShowAllFilter(){
      var element = document.getElementById("ShowAll");
      if (element.checked)  table.clearFilter();
       else table.setFilter("STATUS", "=", "1");
      element = document.getElementById("TotalCount");
      element.textContent = "Количество: "+table.getDataCount("active");
}
// Регистрация функции для обработки checkbox'а "Показать все роутеры"
document.getElementById("ShowAll").addEventListener("change", ShowAllFilter);

// Восстановление состояния таблицы
function restoreTableState(currentPage, selectedRows) {
    if (currentPage) {
        table.setPage(currentPage);
    }
    
    if (selectedRows && selectedRows.length > 0) {
        setTimeout(() => {
            selectedRows.forEach(row => {
                const tableRow = table.getRows().find(r => r.getData().TR === row.TR);
                if (tableRow) {
                    tableRow.select();
                }
            });
        }, 100);
    }
}

// Автоматическое обновление
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(() => {
        if (currentTMS) { 
            loadData(currentTMS); 
        }
    }, 15000);
}

// Обработка кнопки "Настройки"
function Settings(){
    loadFirmsAndBranches();
    loadUsers();
    updateGroupsList();
    document.getElementById('SettingsWindow').style = "position: fixed; width: 100%;  height: 100%; top: 0; left: 0; background-color: rgba(0, 0, 0, 0.6); display: block;";

    if ( UserGroup != 'sc') {// Вкладка с базами TMS доступна только пользователям группы sc
        document.getElementsByClassName('SC')[0].style = "display: none"; // Скрываем закладку с настройками серверов для клиентских настроек
        if ( UserRole === 'Admin' ) {// Admin 
          document.getElementsByClassName('USERS')[0].style = "display: none"; // Скрываем закладку с настройками пользователей
        }
        if ( UserRole === 'User' || UserRole === 'Operator' ) {// Admin 
          document.getElementsByClassName('USERS')[0].style = "display: none"; // Скрываем закладку с настройками пользователей
          document.getElementById("ULButtonBlock").style = "display: none";
          document.getElementById("AddULBlock").style = "display: none";
        }

    }

    // Обработка вкладок окна Settings (пользователи, хосты и тд)
    // Теперь будем обрабатывать клик мышью по заголовку вкладки.
    document.getElementById('settings_tabs').onclick= function (event) {
        target=event.target;
        if (target.classList.contains('tab')) {
          tab = document.getElementsByClassName('tab');
          for (var i=0; i<tab.length; i++) {
            if (target == tab[i]) {
                showSettingsTabsContent(i);
                break;
             }
          }
        }
    }

    function showSettingsTabsContent(b){
        var tabContent = document.getElementsByClassName('tabContent');
        var tab = document.getElementsByClassName('tab');
        if (tabContent[b].classList.contains('hide')) {
          hideSettingsTabsContent(0);
          tab[b].classList.add('whiteborder');
          tabContent[b].classList.remove('hide');
          tabContent[b].classList.add('show');
        }
    }

    function hideSettingsTabsContent(a) {
        var tabContent = document.getElementsByClassName('tabContent');
        var tab = document.getElementsByClassName('tab');
        for (var i=a; i<tabContent.length; i++) {
          tabContent[i].classList.remove('show');
          tabContent[i].classList.add("hide");
          tab[i].classList.remove('whiteborder');
        }
    }
}// end function Settings()

//---------------------------------------------------------------------------
// Инициализация таблиц Firms и Branches
function initializeFirmsTables() {
    // Таблица Firms
    firmsTable = new Tabulator("#firms-table", {
        layout: "fitColumns",
        height:"700px",
        pagination:"local",
        paginationSize:50,
        selectable:1,
        columns: [
            {title: "Num", field: "num", width: 80, editor: "input"},
            {title: "Компания", field: "firm", widthGrow: 1, editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            if ( UserRole=='SuperUser' || UserRole=='Admin' ) {
              menu.push({
                label: "Удалить",
                action: (e, row) => {this.deleteRow(row);}
              });
            }
            return menu;
        },
    });

    // Таблица Branches
    branchesTable = new Tabulator("#branches-table", {
        layout: "fitColumns",
      height:"700px",
      pagination:"local",
      paginationSize:50,
      selectable:1,
        columns: [
            {title: "Num", field: "num", width: 80, editor: "input"},
            {title: "Филиал", field: "branch", widthGrow: 1, editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            if ( UserRole=='SuperUser' || UserRole=='Admin' ) {
              menu.push({
                label: "Удалить",
                action: (e, row) => {this.deleteRow(row);}
              });
            }
            return menu;
        },
    });
   
    // Обработчики для Firms
    document.getElementById('add-firm').addEventListener('click', function() {
        const num = document.getElementById('firm-id').value.trim();
        const name = document.getElementById('firm-name').value.trim();

        if (!num || !name) {alert('Заполните поля Num и Название компании');return;}

        if (isNaN(num)) {alert('Num должен быть числом');return;}

        const newFirm = {
            num: parseInt(num),
            firm: name
        };

        firmsTable.addRow(newFirm);

        // Очищаем форму
        document.getElementById('firm-id').value = '';
        document.getElementById('firm-name').value = '';
    });

    document.getElementById('add-branch').addEventListener('click', function() {
        const num = document.getElementById('branch-id').value.trim();
        const name = document.getElementById('branch-name').value.trim();

        if (!num || !name) {alert('Заполните поля Num и Название филиала');return;}

        if (isNaN(num)) {alert('Num должен быть числом');return;}

        const newBranch = {
            num: parseInt(num),
            branch: name
        };

        branchesTable.addRow(newBranch);

        // Очищаем форму
        document.getElementById('branch-id').value = '';
        document.getElementById('branch-name').value = '';
    });

    document.getElementById('delete-firms').addEventListener('click', function() {
        const selectedFirm = firmsTable.getSelectedRows();
        const selectedBranch = branchesTable.getSelectedRows();
        
        if (selectedFirm.length > 0) {
            if (confirm('Удалить выбранную компанию?')) {
                selectedFirm.forEach(row => row.delete());
            }
        } else if (selectedBranch.length > 0) {
            if (confirm('Удалить выбранный филиал?')) {
                selectedBranch.forEach(row => row.delete());
            }
        } else {
            alert('Выберите компанию или филиал для удаления');
        }
    });

    document.getElementById('save-firms').addEventListener('click', function() {
        saveFirmsAndBranches();
    });

    document.getElementById('cancel-firms').onclick= function (event) {
        document.getElementById('SettingsWindow').style = "position: fixed; width: 100%;  height: 100%; top: 0; left: 0; background-color: rgba(0, 0, 0, 0.6); display: none;";
    }    
}

// Загрузка данных Devices из активной базы
function loadDevices(router_data) {
    if (!currentTMS) {
        console.log('No TMS selected');
        return;
    }
    //console.log('Loading Devices from TMS:', currentTMS.id);
    fetch(`/api?action=get_devices&database=${currentTMS.id}.db&server_address=${currentTMS.address}&server_port=${currentTMS.port}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (data.devices) {
                const element = document.getElementById('dev_type');
                while ( !!element && !!element.options[0] ) element.options[0].remove();
                data.devices.forEach(f => {element.options[element.options.length]=new Option(f.device, f.num);});
                for (i = 0;  i < element.length; i++) {
                  if ( router_data.DEV_NAME == element.options[i].text ) {element.options[i].selected = true; break;}
                }                
            } 
        })
        .catch(error => {
            console.error('Error loading Devices:', error);
        });    
}// end function loadDevices()

// Загрузка данных Firms и Branches из активной базы
function loadFirmsAndBranches() {
    if (!currentTMS) {
        console.log('No TMS selected');
//        currentFirms = [];
//        currentBranches = [];
        firmsTable.setData([]);
        branchesTable.setData([]);
        return;
    }
    //console.log('Loading firms and branches for TMS:', currentTMS.id);

    fetch(`/api?action=get_firms_branches&database=${currentTMS.id}.db&server_address=${currentTMS.address}&server_port=${currentTMS.port}`)
        .then(response => {
//            console.log('Load firms/branches response status:', response.status);
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            //console.log('Loaded firms and branches:', data);
            if (data.firms) {
//                currentFirms = data.firms;
                firmsTable.setData(data.firms);
                // Надо заапдейтить список Юл в окне настройки роутера
                const ul_element = document.getElementById('ul');
                while ( !!ul_element && !!ul_element.options[0] ) ul_element.options[0].remove();
                data.firms.forEach(f => {ul_element.options[ul_element.options.length]=new Option(f.firm);});
            } else {
                firmsTable.setData([]);
                const ul_element = document.getElementById('ul');
                while ( !!ul_element && !!ul_element.options[0] ) ul_element.options[0].remove();
            }
            if (data.branches) {
//                currentBranches = data.branches;
                branchesTable.setData(data.branches);
                // Надо заапдейтить список Филиалов в окне настройки роутера
                const tsp_element = document.getElementById('tsp');
                while ( !!tsp_element && !!tsp_element.options[0] ) tsp_element.options[0].remove();
                data.branches.forEach(b => {tsp_element.options[tsp_element.options.length]=new Option(b.branch);});
            } else {
                branchesTable.setData([]);
            }
        })
        .catch(error => {
            console.error('Error loading firms and branches:', error);
//            currentFirms = [];
//            currentBranches = [];
            firmsTable.setData([]);
            branchesTable.setData([]);
        });
}

// Сохранение данных Firms и Branches
function saveFirmsAndBranches() {
    if (!currentTMS) {
        alert('Выберите сервер для сохранения');
        return;
    }

    const firmsData = firmsTable.getData();
    const branchesData = branchesTable.getData();
    
    const postData = {
        action: 'save_firms_branches',
        //server_id: currentTMS.id, $dbPath = '/opt/' . $database;// . '.db';
        database: currentTMS.id + '.db',
        server_address: currentTMS.address,
        server_port: currentTMS.port,
        firms: firmsData,
        branches: branchesData
    };
    
    //console.log('Saving firms and branches:', postData);
    
    fetch(`/api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
//            console.log('Firms and branches saved successfully');
            loadFirmsAndBranches();
            loadData(currentTMS);
            table.redraw(true);
        } else {
            console.error('Error saving firms and branches:' + (data.error || 'Unknown error'));
            alert('Error saving firms and branches: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Fetch error:', error);
        alert('Fetch error: ' + error.message);
    });
}

function initializeUsersTable() {
    // Создание таблицы с пользователями
    usersTable = new Tabulator("#users-table", {
      height:"700px",
      layout:"fitColumns",
      pagination:"local",
      paginationSize:50,
      selectable:1,
        columns: [
            {title: "TID", field: "tid", width: 80, editor: "input", hozAlign: 'center'},
            {title: "Имя", field: "name", width: 150, editor: "input", hozAlign: 'center'},
            { 
                title: "Группа", 
                field: "group", 
                width: 120, 
                hozAlign: 'center', 
                editorParams: {
                    values: TMSs.map(db => db.name.replace('.db', ''))
                },
                formatter: function(cell) {
                    const value = cell.getValue();
                    return value ? value.replace('.db', '') : '';
                }
            },
            {title: "Роль", field: "role", width: 120, editorParams: {values: ["User", "Operator", "Admin", "SuperUser"]}, hozAlign: 'center'},
            {title: "Дата создания", field: "created_date", width: 180, hozAlign: 'center'},
            {title: "Примечание", field: "note", widthGrow: 1, editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            if ( UserRole=='SuperUser' ) {// Если superuser, то добавим меню 
              menu.push({
                label: "Удалить",
                action: (e, row) => {this.deleteRow(row);}
              });
            }
            return menu;
        },
    });// end new Tabulator("USERS
}

document.getElementById('delete-user').onclick = function() {
    const selectedRows = usersTable.getSelectedRows();
    if (selectedRows.length > 0) {
        selectedRows.forEach(row => {
            row.delete();
        });
    } else {
        alert('Выберите пользователя для удаления');
    }
}
document.getElementById('add-user').onclick = function() {
    const tid = document.getElementById('tid-value').value;
    const name = document.getElementById('login-value').value;
    const password = document.getElementById('psw-value').value;
    const group = document.getElementById('group-field').value;
    const role = document.getElementById('role-field').value;
    if (!tid || !name || !password || !group || !role) {
        alert('Заполните все обязательные поля (TID, Имя, Пароль, Группа, Роль)');
        return;
    }
    const newUser = {
        tid: tid,
        name: name,
        password: password,
        group: group,
        role: role,
        created_date: new Date().toLocaleString()//.toISOString().split('T')[0]
    };
    usersTable.addRow(newUser);
    // Очищаем форму
    document.getElementById('tid-value').value = '';
    document.getElementById('login-value').value = '';
    document.getElementById('psw-value').value = '';
}
document.getElementById('save-users').onclick = function() {
    saveUsers();
}
document.getElementById('cancel-users').onclick= function (event) {
    document.getElementById('SettingsWindow').style = "position: fixed; width: 100%;  height: 100%; top: 0; left: 0; background-color: rgba(0, 0, 0, 0.6); display: none;";
}



// Загрузка пользователей
function loadUsers() {
    fetch('/api?action=get_users')
        .then(response => response.json())
        .then(data => {
            if (data.users) {
                users = data.users;
                usersTable.setData(users);
            }
        })
        .catch(error => {
            console.error('Error loading users:', error);
        });
}

// Сохранение пользователей
function saveUsers() {
    const usersData = usersTable.getData();
    
    const postData = {
        action: 'save_users',
        users: usersData
    };
    
    fetch('/api', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
//            console.log('Пользователи успешно сохранены');
            loadUsers();
//            closeModal();
            // После сохранения пользователей делаем выход и возврат на страницу входа
//            sessionStorage.removeItem('currentUser');
//            window.location.href = 'index.html';
        } else {
//            alert('Ошибка при сохранении пользователей: ' + (data.error || 'Unknown error'));
            console.error('Error saving users:' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error saving users:', error);
//        alert('Ошибка при сохранении пользователей: ' + error.message);
    });
}

// Создание базы данных из записи сервера
function createDatabaseFromServer(serverData) {
    if (!serverData.id) {
        alert('Ошибка: у сервера отсутствует ID');
        return;
    }
    
    const dbName = serverData.id + '.db';
    const dbPath = '/opt/' + dbName;
    
    console.log('Creating database:', dbName);
    console.log('serverData:', serverData);
    
    // Запрашиваем количество записей
    const recordsCount = prompt('Сколько записей создать в базе данных?', '1000');
    
    // Проверяем ввод
    if (recordsCount === null) {
        return; // Пользователь отменил
    }
    
    const count = parseInt(recordsCount);
    if (isNaN(count) || count < 1 || count > 100000) {alert('Пожалуйста, введите число от 1 до 100000');return;}

    checkDatabaseExists(serverData).then(exists => {

        if (exists.exists === 'true') {
            if (!confirm(`База данных "${dbName}" уже существует. Заменить ее?`)) {
                return;
            }
        }
        // Создаем новую базу с указанным количеством записей
        createNewDatabase(serverData, count);
        if ( serverData.address != 'sctms' ) {// Создадим локальную эталонную базу
            localData = serverData;
            localData.address = 'sctms';
            console.log('Locall DB: ', localData);
            createNewDatabase(localData, count);
        }

    }).catch(error => {
        console.error('Ошибка при проверке существования базы:', error);
        alert('Ошибка при проверке существования базы: ' + error.message);
    });
}

// Проверка существования базы данных
function checkDatabaseExists(serverData) {
    return fetch(`/api?action=check_database&database=${serverData.id}.db&server_address=${serverData.address}&server_port=${serverData.port}`)
        .then(response => {
            console.log('Check database response status:', response.status);
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            return data;//.exists || false;
        })
        .catch(error => {
            console.error('Error checking database existence:', error);
            throw error;
        });
}

// Создание новой базы данных
function createNewDatabase(serverData, recordsCount) {
    //console.log("SeRverData", serverData);
    const postData = {
        action: 'create_database',
        database: serverData.id + '.db',
        server_address: serverData.address,
        server_port: serverData.port,
        records_count: recordsCount
    };
    
    console.log('Sending create database request:', postData);
    
    fetch(`/api?action=create_database`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
    })
    .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        if (data.success == 'true') {
            alert(data.message);
            // Обновляем список баз данных
            loadTMSlist();
        } else {
            console.error('Error creating database:' + (data.error || 'Unknown error'));
            alert('Error creating database: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error creating database:', error);
        alert('Error creating database: ' + error.message);
    });
    console.log('Database created successfully');
}

// Создание таблицы с хостами TMS
function initializeTMSTable() {
  TMSTable = new Tabulator("#tms-table", {
      height:"700px",
      layout:"fitColumns",
      pagination:"local",
      paginationSize:50,
      selectable:1,

        columns: [
            {title: "Имя", field: "name", width: 150, editor: "input"},
            {title: "ID", field: "id", width: 100, editor: "input"},
            {title: "Address", field: "address", width: 200, editor: "input"},
            {title: "Port", field: "port", width: 100, editor: "input"},
            {title: "Примечание", field: "note", widthGrow: 1, editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            if ( UserRole=='SuperUser' ) {// Если superuser, то добавим меню 
              menu.push({
                label: "Удалить",
                action: (e, row) => {this.deleteRow(row);}
              });
              menu.push({separator:true,});
              menu.push({
                label: "Create new database",
                action: (e, row) => {createDatabaseFromServer(row.getData());}
              });            }
            return menu;
        },
/*
    columns:[
        {title:"Имя", field:"name",  width: 300, hozAlign: 'center'},
        {title:"ID", field:"key", width: 150, hozAlign: 'center'},
        {title:"Address", field:"address", width: 255, hozAlign: 'center'},
        {title:"Port", field:"port", hozAlign: 'center'},
    ],

    rowContextMenu: function(component, e){
        var menu = [];
        if ( UserRole ==='SuperUser' ) {// Если superuser, то добавим меню 
          menu.push({
            label: "Удалить",
            action: (e, row) => {this.deleteRow(row);}
          });
          menu.push({separator:true,});
  
  
          menu.push(
              {
              label: "Создать начальную базу узлов...",
              menu:[
               {
                  label: "",
                },
               {
                  label:"Вы уверены? Создание базы удалит существующую базу!...",
                  menu:[
                   {
                      label: "",
                    },
                   {
                      label:"Выбрав этот пункт, обратного пути уже не будет!...",
                      menu:[
                       {
                          label: "",
                        },
                        {
                          label:"\"Я уже 100 раз так делал!\" &#9400;",
//                          action:function(e, row){
//                            comet.data['do']='CCFG';
//                            comet.data['node']=0;
//                            comet.data['var']=0;
//                            comet.data['address']= row.getData()['address'];
//                            comet.data['port']= row.getData()['port'];
//                            comet.data['block']= row.getData()['key'];
//                            comet.launch(0);
//                          }
                        },
                      ]
                    },
                  ]
                },
              ]
          });
        }

        return menu;
    },
*/    
  });// end new Tabulator("TMS-table

}

// Обработчики кнопок серверов
document.getElementById('save-tms').onclick = function() {
    saveTMSs();
}

document.getElementById('delete-tms').onclick = function() {
    const selectedRows = TMSTable.getSelectedRows();
    if (selectedRows.length > 0) {
        selectedRows.forEach(row => {
            row.delete();
        });
    } else {
        alert('Выберите сервер для удаления');
    }
}

document.getElementById('add-tms').onclick = function() {
    const name = document.getElementById('tms-name').value;
    const id = document.getElementById('tms-id').value;
    const address = document.getElementById('tms-address').value;
    const port = document.getElementById('tms-port').value;
    if (!name || !id || !address || !port) {
        alert('Заполните все обязательные поля (Имя TMS, ID хоста, Адрес TMS, Порт TMS)');
        return;
    }
    const newServer = {
        name: name,
        id: id,
        address: address,
        port: port
    };
    TMSTable.addRow(newServer);
    // Очищаем форму
    document.getElementById('tms-name').value = '';
    document.getElementById('tms-id').value = '';
    document.getElementById('tms-address').value = '';
    document.getElementById('tms-port').value = '';
}

document.getElementById('cancel-tms').onclick= function (event) {
    document.getElementById('SettingsWindow').style = "position: fixed; width: 100%;  height: 100%; top: 0; left: 0; background-color: rgba(0, 0, 0, 0.6); display: none;";
}

// Автоматическая очистка полей WAN при включении DHCP
document.getElementById('DHCP_Status').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('WAN_addr').value = '';
        document.getElementById('WAN_mask').value = '';
        document.getElementById('WAN_gw').value = '';
        
        // 💡 Опционально: заблокировать поля, чтобы исключить ручной ввод при DHCP
         document.getElementById('WAN_addr').disabled = true;
         document.getElementById('WAN_mask').disabled = true;
         document.getElementById('WAN_gw').disabled = true;
    } else {
        // 💡 Опционально: разблокировать поля при выключении DHCP
         document.getElementById('WAN_addr').disabled = false;
         document.getElementById('WAN_mask').disabled = false;
         document.getElementById('WAN_gw').disabled = false;
    }
});

// Инициализация таблицы
function initializeTerminalTable() {
    table = new Tabulator("#terminal-table", {
    layout:"fitColumns",
    pagination:"local",
    paginationSize:50,
    selectable:1, //make rows selectable
    columns:[
            {title: "TR", field: "TR", width: 68, hozAlign: 'center', sorter: "number", headerFilter: "input"},
            {title: "DEV", field: "DEV_NAME", width: 80, hozAlign: 'center', headerFilter: "input"},
            {title: "Number", field: "DEV_NUMBER", width: 110, hozAlign: 'center', headerFilter: "input"},
            {title: "Firm", field: "UL_NAME", width: 75, hozAlign: 'left', headerFilter: "input"},
            {title: "Branch", field: "TSP_NAME", width: 160, hozAlign: 'left', headerFilter: "input"},
            {title: "Address", field: "ADDRESS", width: 410, headerFilter: "input"},
            {title: "Status", field: "STATUS", width: 90, hozAlign: 'center', formatter:"tickCross",
//                headerFilter: "tickCross",
//                headerFilterParams: {"tristate": true}
            },
            {title: "Link", field: "LINK", width: 80, hozAlign: 'center', formatter:"traffic", formatterParams:{min:1, max:10, color:["green", "red"],}
//                formatter: booleanFormatter,
//                headerFilter: "tickCross",
//                headerFilterParams: {"tristate": true}
            },
            {title: "Uptime", field: "UPTIME", width: 170, hozAlign: 'right', formatter: uptimeFormatter, sorter: "number"},
            {title:"IP external", field:"EXT_IP", width: 130, hozAlign: 'right', visible:true},
            {title:"IP internal", field:"DEV_IP", width: 130, hozAlign: 'right', visible:true},
            {title: "TX", field: "TX", width: 100, hozAlign: 'right', formatter: trafficFormatter, sorter: "number"},
            {title: "RX", field: "RX", width: 100, hozAlign: 'right', formatter: trafficFormatter, sorter: "number"},
            {title: "Channel", field: "CHANNEL_NAME", width: 120, hozAlign: 'center', headerFilter: "input"},
            {title: "Signal",  field: "SIGNAL", width: 100, hozAlign: 'center', formatter: signalFormatter, sorter: "number"},
            {title: "Net", field: "NET", width: 75, hozAlign: 'left', headerFilter: "input"},
//            {
//                title: "Network", 
//                field: "NET", 
//                width: 100,
//                hozAlign: 'center',
//                headerFilter: "input"
//            },
            {title: "SIM1", field: "SIM1", width: 190, headerFilter: "input"},
            {title: "SIM2", field: "SIM2", width: 190, headerFilter: "input"},
            {title: "SIM3", field: "SIM3", width: 190, headerFilter: "input"},
            {title: "MD5", field: "MD5", width: 275, headerFilter: "input"},
            {title: "MAC", field: "MAC", width: 275, headerFilter: "input"},
            {title: "Refresh", field: "REFRESH", width: 150, headerFilter: "input"},
        ],
        rowContextMenu: function(component, e){
        table.deselectRow();
        component.select();            
        data = component.getData();

        var menu = [];
        if ( UserRole === 'User' || UserRole === 'Operator' ) {// Если пользователь USER,
          if ( data.DEV_NAME === 'SRV' || data.DEV_NAME === 'TMS' ) return; // Для TMS м SRV нельзя вызвать RELAY или оффлайн
            menu.push({
              label: "External Power OFF",
              action: (e, row) => {
                  SendRelayCommand(1, row)
              }
            });
            menu.push({
              separator:true,
            });
            menu.push({
              label: "External Power ON",
              action: (e, row) => {
                  SendRelayCommand(0, row)
              }
            });
            return menu;
        }// end if ( UserRole == 2 ) {// Если пользователь USER,

        // Если пользователь ADMIN или SUPERUSER, то полноценное меню
        if ( data.TR == 0 ) {// Если это узел 0, т.е. TMS, то только консоль
          menu.push({
            label: "Консоль",
            action: (e, row) => {
              ConsoleOpen(row);
            }
          });
        } else {
            if (data.DEV_NAME === null) {// Если узел ещё не настроен, то можем настроить и как сервер, и как клиент
              menu.push({
                label: "Настроить, как клиент...",
                action: (e, row) => {
                  config_client=1;
                  OpenConfigurationWindow(1, row);
                }
              });
              menu.push({
                label: "Настроить, как сервер...",
                action: (e, row) => {
                    config_client=0;
                    OpenConfigurationWindow(0, row);
                  }
              });
            } else {// Если узел имеет конфигурацию, то вызываем настройки либо клиента, либо сервера
                if ( data.DEV_NAME != "SRV") {
                  menu.push({
                    label: "Настроить...",
                    action: (e, row) => {
                      OpenConfigurationWindow(1, row);
                    }
                  });
                } else {      
                    menu.push({
                      label: "Настроить...",
                      action: (e, row) => {
                        OpenConfigurationWindow(0, row);
                        }
                    });
                  }
            }// end if ( !!data.dt ) {// Если узел ещё не настроен, то можем настроить и как сервер, и как клиент

            menu.push({
              separator:true,
            });

            menu.push({
              label: "Сбросить настройки",
              action: (e, row) => {
                // Здесь нужно вызвать функцию очистки всех полей узла
                //console.log('TR:', data.TR);
                const result = confirm("Сбросить настройки узла?");
                if (result) {// Обнулим данные по узлу и сохраним
                    ResetConfig(row);
                } //else table.download("xlsx", "data.xlsx", {sheetName:"TMS_sheet"});
                
              }
            });
  
            menu.push({
              separator:true,
            });

            if ( data.DEV_NAME != null && data.LINK == 1 ) {// Если узел онлайн
              menu.push({
                label: "Консоль",
                action: (e, row) => {
                  ConsoleOpen(row);
                }
              });
              menu.push({
                separator:true,
              });

              if ( data.DEV_NAME != null && data.DEV_NAME != 'SRV' && data.DEV_NAME != 'TMS' ) {// Для TMS м SRV нельзя вызвать RELAY
                  menu.push({
                    label: "External Power OFF",
                    action: (e, row) => {
                        SendRelayCommand(1, row)
                    }
                  });
                  menu.push({
                    separator:true,
                  });
                  menu.push({
                    label: "External Power ON",
                    action: (e, row) => {
                        SendRelayCommand(0, row)
                    }
                  });
              }// if ( data.dt != 'SRV' && data.dt != 'TMS' ) {// Для TMS м SRV нельзя вызвать RELAY
            }// end if ( data.st != 10 ) {// Если узел онлайн


        }// end else


        return menu;
    },
    });// end table = new Tabulator

    // Форматтер для TX/RX
    function trafficFormatter(cell, formatterParams, onRendered) {
        const value = cell.getValue();
        if (value === null || value === undefined) return '-';
    
        const KB = 1024;
        const MB = 1024 * KB;
        const GB = 1024 * MB;
    
        if (value >= GB) {
            return (value / GB).toFixed(2) + ' Gb';
        } else if (value >= MB) {
            return (value / MB).toFixed(2) + ' Mb';
        } else if (value >= KB) {
            return (value / KB).toFixed(2) + ' Kb';
        } else {
            return value.toFixed(2) + ' b';
        }
    }


    // Компактный форматтер с секундами
    function uptimeFormatter(cell, formatterParams, onRendered) {
        const timestamp = cell.getValue();
        if (!timestamp) return '-';
        
        const now = Math.floor(Date.now() / 1000);
        const elapsedSeconds = now - timestamp;
        
        if (elapsedSeconds < 0) return 'в будущем';
        
        const days = Math.floor(elapsedSeconds / 86400);
        const hours = Math.floor((elapsedSeconds % 86400) / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        
        if (days > 0) {
            return `${days}д ${hours}ч ${minutes}мин ${seconds}сек`;
        } else if (hours > 0) {
            return `${hours}ч ${minutes}мин ${seconds}сек`;
        } else if (minutes > 0) {
            return `${minutes}мин ${seconds}сек`;
        } else {
            return `${seconds}сек`;
        }
    }
    // Форматтер для Uptime
    //function uptimeFormatter(cell, formatterParams, onRendered) {
    //    const seconds = cell.getValue();
    //    if (!seconds) return '-';
    //
    //    const days = Math.floor(seconds / 86400);
    //    const hours = Math.floor((seconds % 86400) / 3600);
    //    const minutes = Math.floor((seconds % 3600) / 60);
    //    const secs = seconds % 60;
    //
    //    if (days > 0) {
    //        return `${days}д ${hours.toString().padStart(2, '0')}ч ${minutes.toString().padStart(2, '0')}мин ${secs.toString().padStart(2, '0')}сек`;
    //    } else {
    //        return `${hours.toString().padStart(2, '0')}ч ${minutes.toString().padStart(2, '0')}мин ${secs.toString().padStart(2, '0')}сек`;
    //    }
    //}




    // Форматтер для Signal
    function signalFormatter(cell, formatterParams, onRendered) {
        const value = cell.getValue();
        if (value === null || value === undefined) return '-';
    
        let color = '#28a745'; // green - good
        if (value < 7) color = '#dc3545'; // red - bad
        else if (value < 15) color = '#ffc107'; // yellow - medium
    
        //return `<span style="color: ${color}; font-weight: bold;">${value} dBm</span>`;
        return `<span style="color: ${color}; font-weight: bold;">${value}</span>`;
    }
}// end function initializeTerminalTable()


function ConsoleOpen(row) {
    const data = row.getData();

    //const host = '192.168.10.121';
    const host = '10.10.10.22';
    const port = 22;
    const username = 'm';
    const password = 'm';
    //const username = 'softcase';
    //const password = '12TesT90';
    const tr = data.TR;
    const server_address = currentTMS.address;
    const server_port = currentTMS.port;

            
    // Сохраняем данные в sessionStorage для передачи в терминал
    sessionStorage.setItem('sshCredentials', JSON.stringify({
        host,
        port,
        username,
        password,
        server_address,
        server_port,
        tr
    }));
    const credentials = JSON.parse(sessionStorage.getItem('sshCredentials') || '{}');            
    const terminalWindow = window.open('/terminal.html', '_blank');

    if (!terminalWindow) {
        alert('Please allow popups for this site to open terminal in new tab.');
    }

}

function ResetConfig(row) {
    const data = row.getData();

        const postData = {
            action: 'reset_config',
            database: currentTMS.id + '.db',
            server_address: currentTMS.address,
            server_port: currentTMS.port,
            TR: data.TR
        };

    
        //console.log('Saving client configuration:', postData);
    
        fetch(`/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                //console.log('Client configuration saved successfully');
                loadData(currentTMS);
                table.redraw(true);
            } else {
                console.error('Error saving client configuration:' + (data.error || 'Unknown error'));
                alert('Error saving client configuration: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Fetch error:', error);
            alert('Fetch error: ' + error.message);
        });
}// end function ResetConfig(row) 


function SendRelayCommand(command, row) {
    const data = row.getData();

        const postData = {
            action: 'relay',
            database: currentTMS.id + '.db',
            server_address: currentTMS.address,
            server_port: currentTMS.port,
            CMD: command,
            TR: data.TR
        };

    
        //if ( command === 1 ) console.log('Relay OFF:', postData);
        //    else console.log('Relay ON:', postData);
    
        fetch(`/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                //console.log('Relay done successfully');
                loadData(currentTMS);
                table.redraw(true);
            } else {
                console.error('Error while relay doing...:' + (data.error || 'Unknown error'));
                alert('Error while relay doing...: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Fetch error:', error);
            alert('Fetch error: ' + error.message);
        });
}// end function SendRelayCommand(command, row) {

function SaveConfig(row) {
    const data = row.getData();
    //if ( !client ) {// Сохраняем параметры сервера
    //} else {// Сохраняем параметры клиента
        const connectorsData = CONNECTORStable.getData();
        const listenersData = LISTENERStable.getData();
        const serversData = SERVERStable.getData();

        // Определим индекс Firm этого устройства
        var ul_num = 0;
        var element = document.getElementById('ul');
        for (var i = 0;  i < element.length; i++) if ( element.options[i].selected ) {const firmsData = firmsTable.getData(); firmsData.forEach(t => {if ( t.firm == element.options[i].value ) ul_num = t.num;}); break;}
        // Определим индекс Branch этого устройства
        var tsp_num = 0;
        element = document.getElementById('tsp');
        for (var i = 0;  i < element.length; i++) if ( element.options[i].selected ) {const branchesData = branchesTable.getData(); branchesData.forEach(t => {if ( t.branch == element.options[i].value ) tsp_num = t.num;}); break;}
        var dev_type = 0;
        element = document.getElementById('dev_type');
        for (var i = 0;  i < element.length; i++) if ( element.options[i].selected ) {dev_type = element.options[i].value; break;}

        var p = 1;
        if ( document.getElementById('simselect1').checked ) p = 1;
        if ( document.getElementById('simselect2').checked ) p = 2;
        if ( document.getElementById('simselect3').checked ) p = 3;

        if ( document.getElementById('WAN_addr').value.length == 0 ) document.getElementById('DHCP_Status').checked = true;
            else document.getElementById('DHCP_Status').checked = false;
        var wMode = 0;
        element = document.getElementById('wMode');
        for (var i = 0;  i < element.length; i++) if ( element.options[i].selected ) {wMode = Number(element.options[i].value); break;}

        //console.log('currentTMS:', currentTMS.id);
        if (!currentTMS || !currentTMS.address || !currentTMS.port) {console.error('TMS not configured!', ' currentTMS.address:', currentTMS.address, ' currentTMS.port:', currentTMS.port);}
    //console.log('wdhcp:', document.getElementById('DHCP_Status').checked);
        const postData = {
            action: 'save_client_config',
            database: currentTMS.id + '.db',
            server_address: currentTMS.address,
            server_port: currentTMS.port,
            TR: data.TR,
            connectors: connectorsData,
            listeners: listenersData,
            servers: serversData,
            STATUS: document.getElementById('Status').checked,
            MAC: document.getElementById('MAC').value,
            ADDRESS: document.getElementById('address').value,
            TMS_ADDRESS: document.getElementById('TMS_IP').value,
            TMS_PORT: document.getElementById('TMS_Port').value,
            DEV_NUMBER: document.getElementById('dev_num').value,
            DEV_MODEL: document.getElementById('dev_model').value,
            DEV_IP: document.getElementById('RouterIP').value,
            IP_MANAGE: document.getElementById('IP_Managment_Enable').checked,
            SCPN: document.getElementById('scpn').checked,
            COMMENT: document.getElementById('Comment_id').value,
            UL: ul_num,
            TSP: tsp_num,
            DEV: dev_type,
            wip: document.getElementById('WAN_addr').value,
            wmask: document.getElementById('WAN_mask').value,
            wgw: document.getElementById('WAN_gw').value,
            wdhcp: document.getElementById('DHCP_Status').checked,
            dns: document.getElementById('DNS_addr').value,
            lip: document.getElementById('LAN_addr').value,
            lmask: document.getElementById('LAN_mask').value,
            lgw: document.getElementById('LAN_gw').value,
            ldhcp: document.getElementById('LAN_DHCP_Status').checked,
            ssid: document.getElementById('WIFI_ssid').value,
            psw: document.getElementById('WIFI_psw').value,
            type: document.getElementById('WiFi_Status').checked,
            forward: document.getElementById('Forwarding').checked,
            WMODE: wMode,
            priority: p
        };

    
        //console.log('Saving client configuration:', JSON.stringify(postData));

    
        fetch(`/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                //console.log('Client configuration saved successfully');
                loadData(currentTMS);
                table.redraw(true);
            } else {
                console.error('Error saving client configuration:' + (data.error || 'Unknown error'));
                alert('Error saving client configuration: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Fetch error:', error);
            alert('Fetch error: ' + error.message);
        });

/*
        // Отправим в эталон
        if ( currentTMS.id != 'sc') {
            //console.log('Need to send to etalon TMS');
            var ct;
            TMSs.forEach(tms => {if ( tms.id === 'sc' ) ct = tms;}); 
            //console.log('SC TMS: ', ct);

            const scData = {
                action: 'save_client_config',
                database: currentTMS.id + '.db',
                server_address: ct.address,
                server_port: ct.port,
                TR: data.TR,
                connectors: connectorsData,
                listeners: listenersData,
                servers: serversData,
                STATUS: document.getElementById('Status').checked,
                MAC: document.getElementById('MAC').value,
                ADDRESS: document.getElementById('address').value,
                TMS_ADDRESS: document.getElementById('TMS_IP').value,
                TMS_PORT: document.getElementById('TMS_Port').value,
                DEV_NUMBER: document.getElementById('dev_num').value,
                DEV_MODEL: document.getElementById('dev_model').value,
                DEV_IP: document.getElementById('RouterIP').value,
                IP_MANAGE: document.getElementById('IP_Managment_Enable').checked,
                SCPN: document.getElementById('scpn').checked,
                COMMENT: document.getElementById('Comment_id').value,
                UL: ul_num,
                TSP: tsp_num,
                DEV: dev_type,
                wip: document.getElementById('WAN_addr').value,
                wmask: document.getElementById('WAN_mask').value,
                wgw: document.getElementById('WAN_gw').value,
                wdhcp: document.getElementById('DHCP_Status').checked,
                dns: document.getElementById('DNS_addr').value,
                lip: document.getElementById('LAN_addr').value,
                lmask: document.getElementById('LAN_mask').value,
                lgw: document.getElementById('LAN_gw').value,
                ldhcp: document.getElementById('LAN_DHCP_Status').checked,
                ssid: document.getElementById('WIFI_ssid').value,
                psw: document.getElementById('WIFI_psw').value,
                type: document.getElementById('WiFi_Status').checked,
                forward: document.getElementById('Forwarding').checked,
                WMODE: wMode,
                priority: p
            };
    
        
            fetch(`/api`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(scData),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    //console.log('Client configuration saved successfully');
                } else {
                    console.error('Error saving client configuration:' + (data.error || 'Unknown error'));
                    alert('Error saving client configuration: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Fetch error:', error);
                alert('Fetch error: ' + error.message);
            });


        }// end if ( currentTMS.id != 'sc') {
*/








    document.getElementById('ConfigurationWindow').style = "display: none;";
}// end function SaveConfig(client, row) 

function GetConfig(tr) {
    //console.log('Fill data for TMS:', currentTMS);

    fetch(`/api?action=get_config&router_id=${tr}&database=${currentTMS.id}.db&server_address=${currentTMS.address}&server_port=${currentTMS.port}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.log('Error loading data:' + data.error);
            } else {
                //console.log('Data for TMS:', data);
                //    console.log('Data for TMS:', document.getElementById('Comment_id'));
                document.getElementById('MAC').value = data.data[0].MAC;
                document.getElementById('Comment_id').value = data.data[0].COMMENT;
                document.getElementById('TMS_IP').value = data.data[0].TMS_ADDRESS;
                document.getElementById('TMS_Port').value = data.data[0].TMS_PORT;
                document.getElementById('scpn').checked = data.data[0].SCPN;
                document.getElementById('dev_model').value = data.data[0].DEV_MODEL;
                if (data.data[0].DEV_IP) document.getElementById('RouterIP').value = data.data[0].DEV_IP;
                    else document.getElementById('RouterIP').value = "172.16." + Math.floor(tr / 254) + "." + (1+tr - Math.floor(tr / 254)*254);
                document.getElementById('IP_Managment_Enable').checked = data.data[0].IP_MANAGE;
                // Установим UL и TSP в списках
                var element = document.getElementById('ul');
                for (i = 0;  i < element.length; i++) if ( element.options[i].value == data.data[0].UL_NAME ) {element.options[i].selected = true; break;}
                element = document.getElementById('tsp');
                for (i = 0;  i < element.length; i++) if ( element.options[i].value == data.data[0].TSP_NAME ) {element.options[i].selected = true; break;}

                element = document.getElementById('dev_type');
                //console.log('dev_type:', element);
                if (element.length>1) element.options[element.length-1].selected = true; // По умолчанию выберем послений тип - АТМ
                for (i = 0;  i < element.length; i++) if ( element.options[i].value == data.data[0].DEV ) {element.options[i].selected = true; break;}

                if ( data.connectors && data.connectors.length > 0 ) {CONNECTORStable.setData(data.connectors);} else {CONNECTORStable.setData([]);}
                if ( data.listeners && data.listeners.length > 0 ) {LISTENERStable.setData(data.listeners);} else {LISTENERStable.setData([]);}
                if ( data.servers && data.servers.length > 0 ) {SERVERStable.setData(data.servers);} else {SERVERStable.setData([]);}
                if ( data.network && data.network.length > 0 ) {
                    document.getElementById('WAN_addr').value = data.network[0].wip;
                    document.getElementById('WAN_mask').value = data.network[0].wmask;
                    document.getElementById('WAN_gw').value = data.network[0].wgw;
                    if ( data.network[0].wip.length == 0 ) document.getElementById('DHCP_Status').checked = true;
                        else document.getElementById('DHCP_Status').checked = data.network[0].wdhcp;
                    document.getElementById('DNS_addr').value = data.network[0].dns;
                    document.getElementById('LAN_addr').value = data.network[0].lip;
                    document.getElementById('LAN_mask').value = data.network[0].lmask;
                    document.getElementById('LAN_gw').value = data.network[0].lgw;
                    document.getElementById('LAN_DHCP_Status').checked = data.network[0].ldhcp;
                    document.getElementById('WiFi_Status').checked = data.network[0].type;
                    document.getElementById('WIFI_ssid').value = data.network[0].ssid;
                    document.getElementById('WIFI_psw').value = data.network[0].psw;
                    document.getElementById('Forwarding').checked = data.network[0].forward;

                    element = document.getElementById('wMode');
                    element.options[0]=new Option('AccessPoint', 1);
                    element.options[1]=new Option('Client', 2);
                    for (i = 0;  i < element.length; i++) if ( element.options[i].value == data.data[0].WMODE ) {element.options[i].selected = true; break;}

                    switch (data.network[0].priority) {
                        case 1: {document.getElementById('simselect1').checked = true; document.getElementById('simselect2').checked=false; document.getElementById('simselect3').checked=false;break;}
                        case 2: {document.getElementById('simselect1').checked = false; document.getElementById('simselect2').checked=true; document.getElementById('simselect3').checked=false;break;}
                        case 3: {document.getElementById('simselect1').checked = false; document.getElementById('simselect2').checked=false; document.getElementById('simselect3').checked=true;break;}
                    }
                } else {
                    document.getElementById('WAN_addr').value = '';
                    document.getElementById('WAN_mask').value = '';
                    document.getElementById('WAN_gw').value = '';
                    document.getElementById('DHCP_Status').checked = true;
                    document.getElementById('DNS_addr').value = '';
                    document.getElementById('LAN_addr').value = '';
                    document.getElementById('LAN_mask').value = '';
                    document.getElementById('LAN_gw').value = '';
                    document.getElementById('LAN_DHCP_Status').checked = false;
                    document.getElementById('WIFI_ssid').value = '';
                    document.getElementById('WIFI_psw').value = '';
                    document.getElementById('Forwarding').checked = '';
                    document.getElementById('simselect1').checked = true; 
                }// end if ( data.network )
            }
        })
        .catch(error => {
            console.error('GetConfig error: ' + error.message);
            CONNECTORStable.setData([]);
            LISTENERStable.setData([]);            
            SERVERStable.setData([]);            
        });
}// end function GetConfig(tr)) 

function GetServerConfig(tr) {
    //console.log('Loading data for TR:', tr);
    CONNECTORStable.setData([]);
    LISTENERStable.setData([]);            
    BGPtable.setData([]);            
    document.getElementById('asbgp').value = '';
    document.getElementById('gwbgp').value = '';
    document.getElementById('idbgp').value = '';
    document.getElementById('pbfd').value = '';


    fetch(`/api?action=get_server_config&router_id=${tr}&database=${currentTMS.id}.db&server_address=${currentTMS.address}&server_port=${currentTMS.port}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.log('Error loading data:' + data.error);
            } else {
                //console.log('Data:', data);
                //    console.log('Data for TMS:', document.getElementById('Comment_id'));
                
                document.getElementById('MAC').value = data.data[0].MAC;
                document.getElementById('Comment_id').value = data.data[0].COMMENT;
                if (data.data[0].SERVER_ADDRESS) document.getElementById('AddrSrv').value = data.data[0].SERVER_ADDRESS;
                if (data.data[0].SERVER_PORT) document.getElementById('PortSrv').value = data.data[0].SERVER_PORT;
                document.getElementById('TMS_IP').value = data.data[0].TMS_ADDRESS;
                document.getElementById('TMS_Port').value = data.data[0].TMS_PORT;
                if (data.data[0].NETWORK_INTERFACE) document.getElementById('ITF').value = data.data[0].NETWORK_INTERFACE;
                document.getElementById('scpn').checked = data.data[0].SCPN;
                if (data.data[0].BGP_AS) document.getElementById('asbgp').value = data.data[0].BGP_AS;
                if (data.data[0].BGP_GATE) document.getElementById('gwbgp').value = data.data[0].BGP_GATE;
                if (data.data[0].BGP_ID) document.getElementById('idbgp').value = data.data[0].BGP_ID;
                if (data.data[0].BGP_PORT) document.getElementById('pbfd').value = data.data[0].BGP_PORT;

                if ( data.connectors && data.connectors.length > 0 ) {CONNECTORStable.setData(data.connectors);} else {CONNECTORStable.setData([]);}
                if ( data.listeners && data.listeners.length > 0 ) {LISTENERStable.setData(data.listeners);} else {LISTENERStable.setData([]);}
                if ( data.bgp && data.bgp.length > 0 ) {BGPtable.setData(data.bgp);} else {SERVERStable.setData([]);}
                
            }
        })
        .catch(error => {
            console.error('GetConfig error: ' + error.message);
            CONNECTORStable.setData([]);
            LISTENERStable.setData([]);            
            BGPtable.setData([]);            
        });
}// end function GetServerConfig(tr)) 

function SaveServerConfig(row) {
    const data = row.getData();
    const connectorsData = CONNECTORStable.getData();
    const listenersData = LISTENERStable.getData();
    const bgpData = BGPtable.getData();

    if (!currentTMS || !currentTMS.address || !currentTMS.port) {console.error('TMS not configured');}

    const postData = {
        action: 'save_server_config',
        database: currentTMS.id + '.db',
        server_address: currentTMS.address,
        server_port: currentTMS.port,
        TR: data.TR,
        connectors: connectorsData,
        listeners: listenersData,
        bgps: bgpData,
        STATUS: document.getElementById('Status').checked,
        MAC: document.getElementById('MAC').value,
        ADDRESS: document.getElementById('address').value,
        SRV_ADDRESS: document.getElementById('AddrSrv').value,
        SRV_PORT: document.getElementById('PortSrv').value,
        TMS_ADDRESS: document.getElementById('TMS_IP').value,
        TMS_PORT: document.getElementById('TMS_Port').value,
        NETWORK_INTERFACE: document.getElementById('ITF').value,
        SCPN: document.getElementById('scpn').checked,
        BGP_AS: document.getElementById('asbgp').value,
        BGP_ID: document.getElementById('idbgp').value,
        BGP_GATE: document.getElementById('gwbgp').value,
        BGP_PORT: document.getElementById('pbfd').value,
        COMMENT: document.getElementById('Comment_id').value,
        DEV: 1
    };


        //console.log('Saving client configuration:', postData);
    
    fetch(`/api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            //console.log('Client configuration saved successfully');
                loadData(currentTMS);
                table.redraw(true);
        } else {
            console.error('Error saving server configuration:' + (data.error || 'Unknown error'));
            alert('Error saving server configuration: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Fetch error:', error);
        alert('Fetch error: ' + error.message);
    });

/*
    // Отправим в эталон
    if ( currentTMS.id != 'sc') {
        var ct;
        TMSs.forEach(tms => {if ( tms.id === 'sc' ) ct = tms;}); 

        const scData = {
            action: 'save_server_config',
            database: currentTMS.id + '.db',
            server_address: ct.address,
            server_port: ct.port,
            TR: data.TR,
            connectors: connectorsData,
            listeners: listenersData,
            bgps: bgpData,
            STATUS: document.getElementById('Status').checked,
            MAC: document.getElementById('MAC').value,
            ADDRESS: document.getElementById('address').value,
            SRV_ADDRESS: document.getElementById('AddrSrv').value,
            SRV_PORT: document.getElementById('PortSrv').value,
            TMS_ADDRESS: document.getElementById('TMS_IP').value,
            TMS_PORT: document.getElementById('TMS_Port').value,
            NETWORK_INTERFACE: document.getElementById('ITF').value,
            SCPN: document.getElementById('scpn').checked,
            BGP_AS: document.getElementById('asbgp').value,
            BGP_ID: document.getElementById('idbgp').value,
            BGP_GATE: document.getElementById('gwbgp').value,
            BGP_PORT: document.getElementById('pbfd').value,
            COMMENT: document.getElementById('Comment_id').value,
            DEV: 1
        };
    
    
            //console.log('Saving client configuration:', postData);
        
        fetch(`/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scData),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                //console.log('Client configuration saved successfully');
            } else {
                console.error('Error saving server configuration:' + (data.error || 'Unknown error'));
                alert('Error saving server configuration: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Fetch error:', error);
            alert('Fetch error: ' + error.message);
        });



    }// end if ( currentTMS.id != 'sc') {
*/

    document.getElementById('ConfigurationWindow').style = "display: none;";
}// end function SaveServerConfig(row) 

// Окно настройки роутера
function OpenConfigurationWindow(client, row){
    //console.log('✅ Current TMS ', currentTMS);
    loadFirmsAndBranches();
    var data = row.getData();

    loadDevices(data); 

    if ( !client ) {// Пропишем номер севера в окне конфигурации
        document.getElementById('ConfigurationTitle').textContent = "Конфигурация сервера №"+data.TR;
        GetServerConfig(data.TR);
    } else {// Пропишем номер роутера в окне конфигурации
        document.getElementById('ConfigurationTitle').textContent = "Конфигурация роутера №"+data.TR;
        document.getElementById('SIM1').textContent = data.SIM1;
        document.getElementById('SIM2').textContent = data.SIM2;
        document.getElementById('SIM3').textContent = data.SIM3;
        document.getElementById('dev_num').value = data.DEV_NUMBER;
        GetConfig(data.TR);
    }

    document.getElementById('address').value = data.ADDRESS;
    document.getElementById('Status').checked = data.STATUS;

    ServerParams = document.getElementsByClassName('ServerParams');
    ClientParams = document.getElementsByClassName('ClientParams');
    client_tab = document.getElementsByClassName('ClientTab');

    if ( client ) {// Если клиент
      //скрываем серверные настройки и показываем клиентские
      for (var i = ServerParams.length - 1; i >= 0; i--) {
        ServerParams[i].classList.remove('show');
        ServerParams[i].classList.add('hide');
      }
      for (var i = ClientParams.length - 1; i >= 0; i--) {
        ClientParams[i].classList.remove('hide');
        ClientParams[i].classList.add('show');
      }
      // Показываем вкладку с настройками серверов
      client_tab[0].style = "display: inline-block";
      client_tab[1].style = "display: inline-block"; 
    } else {// Если сервер, то скрываем клиентские и показываем серверные
        for (var i = ServerParams.length - 1; i >= 0; i--) {
          ServerParams[i].classList.remove('hide');
          ServerParams[i].classList.add('show');
        }
        for (var i = ClientParams.length - 1; i >= 0; i--) {
          ClientParams[i].classList.remove('show');
          ClientParams[i].classList.add('hide');
        }
        client_tab[0].style = "display: none"; // Скрываем закладку с настройками серверов для клиентских настроек
        client_tab[1].style = "display: none"; // Скрываем закладку с настройками серверов для клиентских настроек
        showConfigTabsContent(0);
      }    

/*
    comet.pause = true; // Поставим comet на паузу на время работы окна

    var SelectedRows = table.getSelectedRows();
    var index = SelectedRows[0].getIndex(); // Получим индекс выделенного (сохраняемого) узла
    document.getElementById('FROM').value = index;
    document.getElementById('TO').value = index;
    NODEStable.clearData();
    document.getElementById("NODE").value = '';

    // Почистим и создадим список ЮЛ
    ul_element = document.getElementById('ul');
    // Сначала почистиим списоки
    while ( !!ul_element && !!ul_element.options[0] ) ul_element.options[0].remove();
    var ul_data = ULtable.getData();
    var rowCount = ULtable.getDataCount();
    for (var index = 0; index < rowCount; index++) {
      newUL = new Option(ul_data[index].ulname, ul_data[index].ulid);
      ul_element.options[ul_element.options.length]=newUL;          
    }

    // Почистим и создадим список ТСП
    tsp_element = document.getElementById('tsp');
    // Сначала почистиим списоки
    while ( !!tsp_element && !!tsp_element.options[0] ) tsp_element.options[0].remove();
    var tsp_data = TSPtable.getData();
    var rowCount = TSPtable.getDataCount();
    for (var index = 0; index < rowCount; index++) {
      newUL = new Option(tsp_data[index].tspname, tsp_data[index].tspid);
      tsp_element.options[tsp_element.options.length]=newUL;          
    }


  
    FillData (client, row);
    ServerParams = document.getElementsByClassName('ServerParams');
    ClientParams = document.getElementsByClassName('ClientParams');
    client_tab = document.getElementsByClassName('ClientTab');
    if ( client ) {// Если клиент
      //скрываем серверные настройки и показываем клиентские
      for (var i = ServerParams.length - 1; i >= 0; i--) {
        ServerParams[i].classList.remove('show');
        ServerParams[i].classList.add('hide');
      }
      for (var i = ClientParams.length - 1; i >= 0; i--) {
        ClientParams[i].classList.remove('hide');
        ClientParams[i].classList.add('show');
      }
      // Показываем вкладку с настройками серверов
      client_tab[0].style = "display: inline-block";
    } else {// Если сервер, то скрываем клиентские и показываем серверные
        for (var i = ServerParams.length - 1; i >= 0; i--) {
          ServerParams[i].classList.remove('hide');
          ServerParams[i].classList.add('show');
        }
        for (var i = ClientParams.length - 1; i >= 0; i--) {
          ClientParams[i].classList.remove('show');
          ClientParams[i].classList.add('hide');
        }
        client_tab[0].style = "display: none"; // Скрываем закладку с настройками серверов для клиентских настроек
        showConfigTabsContent(0);
      }
    if ( UserRole==2 ) {// Если пользователь User, то права только на просмотр
      document.getElementById("ConfigButtonBlock").style="display: none";
    }
*/    
    document.getElementById('ConfigurationWindow').style = "position: fixed; width: 100%;  height: 100%; top: 0; left: 0; background-color: rgba(0, 0, 0, 0.6); display: block;";
    document.getElementById('CancelConfigurationButton').onclick= function (event) {
        document.getElementById('ConfigurationWindow').style = "display: none;";
    }
    document.getElementById('SaveConfigurationButton').onclick= function (event) {
        if ( client ) SaveConfig(row);
        else SaveServerConfig(row);
    }

}// end function OpenConfigurationWindow(client, row){

// Добавление параметров нового сервера
document.getElementById('add-server').addEventListener('click', function() {
    const address = document.getElementById('server_ip_value').value.trim();
    const port = document.getElementById('server_port_value').value.trim();
    if (!address || !port) {alert('Заполните поля Server IP и Port');return;}
    if (isNaN(port)) {alert('Port должен быть числом');return;}
    const newServer = {ip: address, port: parseInt(port)};
    SERVERStable.addRow(newServer);
    // Очищаем форму
    document.getElementById('server_ip_value').value = '';
    document.getElementById('server_port_value').value = '';
});

// Добавление параметров новго коннектора
document.getElementById('add-connector').addEventListener('click', function() {
    const itf = document.getElementById("con_num").value;
    if ( itf < 11 ) {alert("Номер интерфейса должен быть больше 10"); return;} 
    const main_ip = document.getElementById("con_main_ip_value").value;
    const main_port = document.getElementById("con_main_port_value").value;
    if (!main_ip || !main_port) {alert('Заполните поля для основного адреса и порта');return;}
    if (isNaN(main_port)) {alert('Port должен быть числом');return;}
    const backup_ip = document.getElementById("con_backup_ip_value").value;
    var backup_port = document.getElementById("con_backup_port_value").value;
    if (backup_port) {if (isNaN(backup_port)) {alert('Port должен быть числом');return;}}
        else backup_port=0;
    const connectors = CONNECTORStable.getData();
    const rowCount = CONNECTORStable.getDataCount();
    for (var index = 0; index < rowCount; index++) {
      if ( connectors[index].itf == itf ) {alert("Duplicate ITF number");return;}
    }
    const fieldEl = document.getElementById("con_type");
    const filterVal = fieldEl.options[fieldEl.selectedIndex].value;
    const newConnector = {itf:itf, ip_main: main_ip, port_main: parseInt(main_port), ip_back: backup_ip, port_back: parseInt(backup_port), type:filterVal};
    CONNECTORStable.addRow(newConnector);
    // Очищаем форму
    document.getElementById("con_num").value = '';
    document.getElementById("con_main_ip_value").value = '';
    document.getElementById("con_main_port_value").value = '';
    document.getElementById("con_backup_ip_value").value = '';
    document.getElementById("con_backup_port_value").value = '';
});

// Добавление параметров новго листенера
document.getElementById('add-listener').addEventListener('click', function() {
    const itf = document.getElementById("lsn_port_value").value;
    const lsn_ip = document.getElementById("lsn_ip_value").value;
    const lsn_port = document.getElementById("lsn_port_value").value;
    const dst_node = document.getElementById("dst_node_value").value;
    const dst_itf = document.getElementById("dst_itf_value").value;
    if ( lsn_ip=='' || lsn_port=='' || dst_node=='' || dst_itf=='') {alert("Empty fields!");return;}
    if (isNaN(dst_node)) {alert('Dest Node должен быть числом');return;}
    if (isNaN(dst_itf)) {alert('Dest ITF должен быть числом');return;}
    const listeners = LISTENERStable.getData();
    const rowCount = LISTENERStable.getDataCount();
    for (var index = 0; index < rowCount; index++) {
        if ( listeners[index].ip_main == lsn_ip && listeners[index].port_main == lsn_port ) {alert("Duplicate ip:port number");return;}
        if ( listeners[index].port_main == lsn_port ) {alert("Duplicate port number");return;}
    }
    const fieldEl = document.getElementById("lsn_type");
    const filterVal = fieldEl.options[fieldEl.selectedIndex].value;
    const newListener = {itf:itf, ip_main: lsn_ip, port_main: parseInt(lsn_port), dnode: dst_node, dface: parseInt(dst_itf), type:filterVal};
    LISTENERStable.addRow(newListener);
    // Очищаем форму
    document.getElementById("lsn_port_value").value = '';
    document.getElementById("lsn_ip_value").value = '';
    document.getElementById("dst_node_value").value = '';
    document.getElementById("dst_itf_value").value = '';
});

// Отработка события по нажатию кнопки "Добавить" в окне Конфигурации, вкладка "SCPN"
document.getElementById("AddBGPButton").addEventListener("click", function(){
    var bgp_address = document.getElementById("bgp_ip_value").value;
    var bgp_port = document.getElementById("bgp_port_value").value;
    if ( bgp_address=='' || bgp_port=='') {alert("Empty fields!");return;}
    var data = BGPtable.getData();
    var rowCount = BGPtable.getDataCount();
    var index = 0;
    if ( rowCount ) index = data[rowCount-1].id+1;
    BGPtable.addRow({id:index, ip:bgp_address, port:bgp_port}, false);
});

  // Отработка события по нажатию checkbox "SCPN" для WAN во вкладке "SCPN
document.getElementById("scpn").addEventListener("click", function(){
    var data = table.getData();
    var SelectedRows = table.getSelectedRows();
    //var index = SelectedRows[0].getIndex(); // Получим индекс выделенного (сохраняемого) узла
    var L3_tab = document.getElementsByClassName('L3');
    
    var dname = SelectedRows[0].getData().DEV_NAME;
    
    if (document.getElementById('scpn').checked) {
        //console.log('dname: ', dname);
        if ( dname != "SRV"){
            for (var i = L3_tab.length - 1; i >= 0; i--) L3_tab[i].style = "display: none"; // Скрываем закладки с настройками Connectors и Listeners
        }
    } else {// Если сервер, то скрываем клиентские и показываем серверные
        if ( dname != "SRV")
              for (var i = L3_tab.length - 1; i >= 0; i--) L3_tab[i].style = "display: inline-block"; // Показываем закладки с настройками Connectors и Listeners
    }
});

// Иинициализация таблиц окна конфигурации роутера
function initializeConfigTables() {
    SERVERStable = new Tabulator("#servers-table", {
          height:"300px",
          layout:"fitColumns",
          pagination:"local",
          paginationSize:50,
          selectable:1,
        columns:[
            {title:"IP address", field:"ip",  width: 300, hozAlign: 'center', editor: "input"},
            {title:"Port", field:"port", width: 150, hozAlign: 'center', editor: "input"},
            {title:"Примечание", field:"comment",  width: 592, hozAlign: 'center', editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            menu.push({
              label: "Удалить",
              action: (e, row) => {
                this.deleteRow(row);
              }
            });
            return menu;
        },
      });// end new Tabulator("SERVERS

    // Создание таблицы с адресами и портами серверов
    BGPtable = new Tabulator("#BGP-table", {
      height:"300px",
      layout:"fitColumns",
      pagination:"local",
      paginationSize:50,
      selectable:1,
    columns:[
        {title:"BGP address", field:"ip",  width: 300, hozAlign: 'center'},
        {title:"Port", field:"port", width: 150, hozAlign: 'center'},
        {title:"Примечание", field:"comment", width: 592, hozAlign: 'center'},
    ],
    rowContextMenu: function(component, e){
        var menu = [];
        menu.push({
          label: "Удалить",
          action: (e, row) => {
            this.deleteRow(row);
          }
        });
        return menu;
    },
    });// end new Tabulator("BGP

    CONNECTORStable = new Tabulator("#CONNECTORS-table", {
          height:"520px",
          layout:"fitColumns",
          pagination:"local",
          paginationSize:50,
          selectable:1,
        columns:[
            {title:"ITF", field:"itf",  width: 150, hozAlign: 'center'},
            {title:"Main address", field:"ip_main", width: 200, hozAlign: 'center', editor: "input"},
            {title:"port", field:"port_main", width: 100, hozAlign: 'center', editor: "input"},
            {title:"Backup address", field:"ip_back", width: 200, hozAlign: 'center', editor: "input"},
            {title:"Backup port", field:"port_back", width: 100, hozAlign: 'center', editor: "input"},
            {title:"Тип", field:"type",  width: 100, formatter: typeFormatter, hozAlign: 'center', editor: "input"},
            {title:"Примечание", field:"comment",  width: 250, hozAlign: 'center', editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            menu.push({
              label: "Удалить",
              action: (e, row) => {
                this.deleteRow(row);
              }
            });
            return menu;
        },

      });// end new Tabulator("CONNECTORS

    LISTENERStable = new Tabulator("#LISTENERS-table", {
          height:"520px",
          layout:"fitColumns",
          pagination:"local",
          paginationSize:50,
          selectable:1,
        columns:[
            {title:"ITF", field:"itf",  width: 150, hozAlign: 'center'},
            {title:"Address", field:"ip_main", width: 200, hozAlign: 'center', editor: "input"},
            {title:"port", field:"port_main", width: 100, hozAlign: 'center', editor: "input"},
            {title:"Dest Node", field:"dnode", width: 150, hozAlign: 'center', editor: "input"},
            {title:"Dest ITF", field:"dface", width: 150, hozAlign: 'center', editor: "input"},
            {title:"Тип", field:"type",  width: 100, formatter: typeFormatter, hozAlign: 'center', editor: "input"},
            {title:"Примечание", field:"comment",  width: 250, hozAlign: 'center', editor: "input"},
        ],
        rowContextMenu: function(component, e){
            var menu = [];
            menu.push({
              label: "Удалить",
              action: (e, row) => {
                this.deleteRow(row);
              }
            });
            return menu;
        },
      });// end new Tabulator("LISTENERS

        // Форматтер для типа соединения 1-TCP, 2-UDP
    function typeFormatter(cell, formatterParams, onRendered) {
        const value = cell.getValue();
        if (value === null || value === undefined) return '-';
    
        if (value == 1) {return 'TCP';} else {return 'UDP';}
    }

}// end function initializeConfigTables()


// Обработка вкладок окна Конфигурации
// Теперь будем обрабатывать клик мышью по заголовку вкладки.
document.getElementById('config_tabs').onclick= function (event) {
    target=event.target;
    if (target.classList.contains('tab_config')) {
      tab = document.getElementsByClassName('tab_config');
      for (var i=0; i<tab.length; i++) {
        if (target == tab[i]) {
            //console.log(tab[i].textContent);
            if ( tab[i].textContent === 'Device') {
                // Зададим нужное ЮЛ
                var element = document.getElementById('ul');
                for (j = 0;  j < element.length; j++) {
                    //console.log("UL: ", data.UL_NAME, "  -  ", element.options[j].value);
                    if ( data.UL_NAME == element.options[j].value ) {element.options[j].selected = true;break;}
                }
                // Зададим нужное ТСП
                element = document.getElementById('tsp');
                for (j = 0;  j < element.length; j++) {
                  if ( data.TSP_NAME == element.options[j].value ) {element.options[j].selected = true; break;}
                }
            }
            showConfigTabsContent(i);
            break;
         }
      }
    }
}
  
function showConfigTabsContent(b){
    tabContent = document.getElementsByClassName('tabContentConfig');
    tab = document.getElementsByClassName('tab_config');
    if (tabContent[b].classList.contains('hide')) {
      hideConfigTabsContent(0);
      tab[b].classList.add('whiteborder');
      tabContent[b].classList.remove('hide');
      tabContent[b].classList.add('show');
    }
}

function hideConfigTabsContent(a) {
    tabContent = document.getElementsByClassName('tabContentConfig');
    tab = document.getElementsByClassName('tab_config');
    for (var i=a; i<tabContent.length; i++) {
      tabContent[i].classList.remove('show');
      tabContent[i].classList.add("hide");
      tab[i].classList.remove('whiteborder');
    }
}

// Инициализация приложения
function initializeApp() {
    console.log('🚀 Инициализация main.html');
    
    const currentUser = checkAuth();
    if (!currentUser) return;

    UserRole = currentUser.role;
    currentTMS = currentUser.group;
    UserGroup = currentTMS.replace('.db', '');
    console.log('✅ Роль ', UserRole);    
    console.log('✅ Group ', UserGroup);    
  
    if ( UserGroup === 'sc') {// Группа sc добавим выбор ТМС
        element = document.getElementById("work_panel");
        element.insertAdjacentHTML("afterbegin", `
            <span style="padding-left: 10px; padding-top: 10px; min-width: 60px">TMS :</span>
            <select id="tms_selector" style="font-size: 16px; margin: 5px; min-width: 150px; border: 2px solid black; border-width: 2px;">
            </select>
            <div id="client_selector_block">
            <select id="client_selector" style="font-size: 16px; min-height: 30px;margin: 5px;min-width: 150px; border: 2px solid black; border-width: 2px;">
            </select>
            </div>
        `);

        element = document.getElementById("settings_block");
        element.insertAdjacentHTML("afterbegin", `
            <button id="SettingsButton" onclick="return Settings();" type="text" class="clear_filter_button" style="margin-left: 50px; border: 2px solid black;border-width: 2px;border-radius: 10px; padding: 5px;">Настройки</button>
        `);
        document.getElementById("tms_selector").addEventListener("change", selectTMS);
        document.getElementById("client_selector").addEventListener("change", selectClientTMS);

    } else {
        if ( UserRole === 'Admin' || UserRole === 'SuperUser' ) {
            element = document.getElementById("settings_block");
            element.insertAdjacentHTML("afterbegin", `
                <button id="SettingsButton" onclick="return Settings();" type="text" class="clear_filter_button" style="margin-left: 50px; border: 2px solid black;border-width: 2px;border-radius: 10px; padding: 5px;">Настройки</button>
            `);
        }
    }
    console.log('✅ Авторизация пройдена, продолжаем инициализацию!');
    console.log('✅ 1');
    document.getElementById('current-user').textContent = currentUser.name;


    loadTMSlist(); 
    initializeTerminalTable();
    initializeUsersTable();
    initializeTMSTable();
    initializeFirmsTables();
//    setupModalDrag();
//    setupModalRouterDrag();
    initializeConfigTables();


    document.getElementById('terminal-table').classList.add('table-dark');

    ShowAllFilter();

/*
    // Обработчик изменения выбора сервера
    document.getElementById('database-select').addEventListener('change', function() {
        const selectedId = this.value;
        const selectedOption = this.options[this.selectedIndex];
        
        if (selectedOption && selectedOption.getAttribute('data-server')) {
            currentServer = JSON.parse(selectedOption.getAttribute('data-server'));
            loadData(currentServer);
        } else {
            currentServer = null;
            table.setData([]);
            firmsTable.setData([]);
            branchesTable.setData([]);
        }
    });

*/
    // Обработчик кнопки выхода
    document.getElementById('logout-btn').addEventListener('click', function() {
        console.log('🚪 Выход из системы');
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });

    
    // Остановка обновления при скрытии страницы
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
        } else {
            if (currentTMS) { 
                startAutoRefresh();
            }
        }
    });    
    
//    // Закрытие модального окна по ESC
//    document.addEventListener('keydown', function(event) {
//        if (event.key === 'Escape') {
//            document.getElementById('SettingsWindow').style = "display: none;";
//            document.getElementById('ConfigurationWindow').style = "display: none";
//        }
//    });

document.addEventListener('keydown', function(event) {
    // 1. Обработка Ctrl+B (или Cmd+B на macOS)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault(); // ⚠️ Отменяем стандартное действие браузера (жирный шрифт / закладки)
        
        // Опционально: игнорировать, если фокус в поле ввода/редактирования
        if (document.activeElement.matches('input, textarea, select, [contenteditable]')) return;

        //console.log('⌨️ Нажата комбинация Ctrl+B');
        table.element.classList.toggle('table-dark');
        // Принудительная перерисовка обязательна для применения стилей
        table.redraw();
        return;
    }

    // 2. Обработка Escape (оставляем без изменений)
    if (event.key === 'Escape') {
        document.getElementById('SettingsWindow').style = "display: none;";
        document.getElementById('ConfigurationWindow').style = "display: none;";
    }
});


/*
    // Центрирование при изменении размера окна
    window.addEventListener('resize', function() {
        centerModal();
    });
*/    
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initializeApp);
