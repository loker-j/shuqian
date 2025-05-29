// 书签管理器主类
class BookmarkManager {
  constructor() {
    this.bookmarks = [];
    this.expandedFolders = new Set();
    this.searchQuery = '';
    this.currentEditingId = null;
    this.contextMenuTarget = null;
    this.nextId = 1; // 用于生成唯一ID
    this.currentMode = 'plugin'; // 'plugin' 或 'chrome'
    this.debugLogs = []; // 调试日志存储
    this.maxDebugLogs = 100; // 最大日志条数
    
    this.init();
  }

  // 初始化
  async init() {
    this.addDebugLog('📚 BookmarkManager初始化开始', 'info');
    
    // 浏览器兼容性检查
    this.checkBrowserCompatibility();
    
    this.bindEvents();
    await this.loadExpandedState();
    await this.loadBookmarksFromStorage(); // 恢复为本地存储
    this.hideLoading();
    this.addDebugLog('✅ BookmarkManager初始化完成', 'success');
  }

  // 浏览器兼容性检查
  checkBrowserCompatibility() {
    this.addDebugLog('🔍 检查浏览器兼容性', 'info');
    
    // 检查浏览器信息
    const userAgent = navigator.userAgent;
    this.addDebugLog(`📋 用户代理: ${userAgent}`, 'info');
    
    // 检测浏览器类型
    let browserType = 'Unknown';
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg') && !userAgent.includes('OPR')) {
      browserType = 'Chrome';
    } else if (userAgent.includes('Edg')) {
      browserType = 'Edge';
    } else if (userAgent.includes('OPR')) {
      browserType = 'Opera';
    } else if (userAgent.includes('Chrome')) {
      browserType = 'Chromium-based';
    }
    
    this.addDebugLog(`🌐 检测到浏览器类型: ${browserType}`, 'info');
    
    // 检查Chrome API可用性
    this.addDebugLog('🔧 检查Chrome API可用性:', 'info');
    this.addDebugLog(`  - chrome.bookmarks: ${!!chrome?.bookmarks}`, 'info');
    this.addDebugLog(`  - chrome.bookmarks.getTree: ${!!chrome?.bookmarks?.getTree}`, 'info');
    this.addDebugLog(`  - chrome.bookmarks.remove: ${!!chrome?.bookmarks?.remove}`, 'info');
    this.addDebugLog(`  - chrome.bookmarks.removeTree: ${!!chrome?.bookmarks?.removeTree}`, 'info');
    this.addDebugLog(`  - chrome.storage: ${!!chrome?.storage}`, 'info');
    this.addDebugLog(`  - chrome.tabs: ${!!chrome?.tabs}`, 'info');
    
    // 存储浏览器信息供后续使用
    this.browserInfo = {
      type: browserType,
      userAgent: userAgent,
      hasBookmarkAPI: !!chrome?.bookmarks,
      hasStorageAPI: !!chrome?.storage,
      hasTabAPI: !!chrome?.tabs
    };
    
    this.addDebugLog(`💾 浏览器信息已保存: ${JSON.stringify(this.browserInfo)}`, 'info');
  }

  // 绑定事件监听器
  bindEvents() {
    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });
    
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      this.handleSearch('');
    });

    // 导入书签
    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importInput');
    
    importBtn.addEventListener('click', () => {
      importInput.click();
    });
    
    importInput.addEventListener('change', (e) => {
      this.handleFileImport(e.target.files[0]);
    });

    // 添加书签
    document.getElementById('addBookmarkBtn').addEventListener('click', () => {
      this.addCurrentTab();
    });

    // 切换显示模式
    const toggleModeBtn = document.getElementById('toggleModeBtn');
    if (toggleModeBtn) {
      this.addDebugLog('🔗 找到切换模式按钮，绑定事件', 'info');
      toggleModeBtn.addEventListener('click', () => {
        this.addDebugLog('🖱️ 切换按钮被点击', 'info');
        this.toggleDisplayMode();
      });
    } else {
      this.addDebugLog('❌ 未找到toggleModeBtn元素', 'error');
    }

    // 右键菜单
    document.addEventListener('contextmenu', (e) => {
      const bookmarkItem = e.target.closest('.bookmark-item');
      if (bookmarkItem) {
        e.preventDefault();
        this.showContextMenu(e, bookmarkItem);
      }
    });

    // 点击其他地方隐藏右键菜单
    document.addEventListener('click', () => {
      this.hideContextMenu();
    });

    // 右键菜单操作
    document.getElementById('contextMenu').addEventListener('click', (e) => {
      this.addDebugLog('🖱️ contextMenu 点击事件被触发', 'info');
      this.addDebugLog(`🎯 点击目标: ${e.target.tagName}, className: ${e.target.className}`, 'info');
      
      // 尝试多种方式找到菜单项
      let menuItem = e.target.closest('.menu-item');
      if (!menuItem) {
        // 如果closest失败，尝试向上查找
        let currentElement = e.target;
        while (currentElement && currentElement !== document.getElementById('contextMenu')) {
          if (currentElement.classList && currentElement.classList.contains('menu-item')) {
            menuItem = currentElement;
            break;
          }
          currentElement = currentElement.parentElement;
        }
      }
      
      this.addDebugLog(`📋 找到的菜单项: ${!!menuItem}`, 'info');
      
      if (menuItem) {
        const action = menuItem.dataset.action;
        this.addDebugLog(`🎬 获取到的action: ${action}`, 'info');
        
        if (action) {
          this.addDebugLog(`✅ 准备执行操作: ${action}`, 'info');
          this.handleContextMenuAction(action);
        } else {
          this.addDebugLog('❌ 菜单项没有action属性', 'error');
          this.addDebugLog(`📊 菜单项详情: ${JSON.stringify({
            tagName: menuItem.tagName,
            className: menuItem.className,
            dataset: Object.keys(menuItem.dataset),
            innerHTML: menuItem.innerHTML.substring(0, 100)
          })}`, 'info');
        }
      } else {
        this.addDebugLog('❌ 未找到菜单项元素', 'error');
        this.addDebugLog(`🔍 点击位置详情: ${JSON.stringify({
          targetTag: e.target.tagName,
          targetClass: e.target.className,
          targetId: e.target.id,
          parentTag: e.target.parentElement?.tagName,
          parentClass: e.target.parentElement?.className
        })}`, 'info');
      }
    });

    // DIA浏览器兼容性：额外绑定各个菜单项的直接点击事件
    this.bindDirectMenuEvents();

    // 编辑模态框
    this.bindModalEvents();

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // 调试日志控制（新增）
    const debugToggle = document.getElementById('debugToggle');
    const debugLog = document.getElementById('debugLog');
    const clearDebugLog = document.getElementById('clearDebugLog');
    
    if (debugToggle && debugLog) {
      debugToggle.addEventListener('click', () => {
        const isVisible = debugLog.style.display !== 'none';
        debugLog.style.display = isVisible ? 'none' : 'block';
        debugToggle.textContent = isVisible ? '🔍 显示调试日志' : '🔍 隐藏调试日志';
        
        if (!isVisible) {
          this.addDebugLog('🔧 调试日志面板已打开', 'info');
        }
      });
    }
    
    if (clearDebugLog) {
      clearDebugLog.addEventListener('click', () => {
        this.clearDebugLog();
      });
    }

    // 测试事件按钮（新增）
    const testEventBtn = document.getElementById('testEventBtn');
    if (testEventBtn) {
      testEventBtn.addEventListener('click', () => {
        this.addDebugLog('🧪 测试事件按钮被点击', 'info');
        this.testEventSystem();
      });
    }
  }

  // 测试事件系统
  async testEventSystem() {
    this.addDebugLog('🔬 开始测试事件系统', 'info');
    
    // 测试confirm对话框
    try {
      this.addDebugLog('📋 测试confirm对话框', 'info');
      const testConfirm = await this.compatibleConfirm('这是一个测试确认对话框，点击确定或取消', '测试确认对话框');
      this.addDebugLog(`✅ confirm测试结果: ${testConfirm}`, 'success');
    } catch (error) {
      this.addDebugLog(`❌ confirm测试失败: ${error.message}`, 'error');
    }
    
    // 测试右键菜单元素
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
      this.addDebugLog('🎯 contextMenu元素存在', 'info');
      
      // 查找删除菜单项
      const deleteItem = contextMenu.querySelector('[data-action="delete"]');
      if (deleteItem) {
        this.addDebugLog('🗑️ 删除菜单项存在', 'info');
        this.addDebugLog(`📊 删除菜单项详情: ${JSON.stringify({
          tagName: deleteItem.tagName,
          className: deleteItem.className,
          dataset: Object.keys(deleteItem.dataset),
          textContent: deleteItem.textContent.trim()
        })}`, 'info');
      } else {
        this.addDebugLog('❌ 删除菜单项不存在', 'error');
      }
    } else {
      this.addDebugLog('❌ contextMenu元素不存在', 'error');
    }
    
    // 测试浏览器API
    this.addDebugLog('🌐 测试浏览器API可用性', 'info');
    this.addDebugLog(`📋 chrome.bookmarks: ${!!chrome?.bookmarks}`, 'info');
    this.addDebugLog(`📋 chrome.bookmarks.remove: ${!!chrome?.bookmarks?.remove}`, 'info');
    
    this.addDebugLog('✅ 事件系统测试完成', 'success');
  }

  // 绑定模态框事件
  bindModalEvents() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementById('editModalClose');
    const cancelBtn = document.getElementById('editModalCancel');
    const saveBtn = document.getElementById('editModalSave');

    const closeModal = () => {
      modal.style.display = 'none';
      this.currentEditingId = null;
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    saveBtn.addEventListener('click', () => {
      this.saveBookmarkEdit();
    });

    // 回车保存
    document.getElementById('editTitle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveBookmarkEdit();
    });
    
    document.getElementById('editUrl').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveBookmarkEdit();
    });

    // 自定义确认对话框事件绑定（DIA浏览器兼容性）
    this.bindConfirmModalEvents();
  }

  // 绑定自定义确认对话框事件
  bindConfirmModalEvents() {
    const confirmModal = document.getElementById('confirmModal');
    const confirmCancel = document.getElementById('confirmModalCancel');
    const confirmConfirm = document.getElementById('confirmModalConfirm');

    if (confirmCancel) {
      confirmCancel.addEventListener('click', () => {
        this.hideCustomConfirm(false);
      });
    }

    if (confirmConfirm) {
      confirmConfirm.addEventListener('click', () => {
        this.hideCustomConfirm(true);
      });
    }

    // 点击背景关闭（相当于取消）
    if (confirmModal) {
      confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
          this.hideCustomConfirm(false);
        }
      });
    }
  }

  // 显示自定义确认对话框
  showCustomConfirm(message, title = '确认操作') {
    this.addDebugLog(`🔔 显示自定义确认对话框: ${message}`, 'info');
    
    return new Promise((resolve) => {
      this.confirmCallback = resolve;
      
      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmModalTitle');
      const messageEl = document.getElementById('confirmModalMessage');
      
      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      
      if (modal) {
        modal.style.display = 'flex';
        this.addDebugLog('✅ 自定义确认对话框已显示', 'info');
      } else {
        this.addDebugLog('❌ 确认对话框元素不存在', 'error');
        resolve(false);
      }
    });
  }

  // 隐藏自定义确认对话框
  hideCustomConfirm(result) {
    this.addDebugLog(`🔔 隐藏自定义确认对话框，结果: ${result}`, 'info');
    
    const modal = document.getElementById('confirmModal');
    if (modal) {
      modal.style.display = 'none';
    }
    
    if (this.confirmCallback) {
      this.confirmCallback(result);
      this.confirmCallback = null;
    }
  }

  // 兼容性确认对话框（优先使用自定义对话框）
  async compatibleConfirm(message, title = '确认操作') {
    this.addDebugLog(`🤔 compatibleConfirm调用: ${message}`, 'info');
    
    // 首先测试原生confirm是否正常工作
    if (this.isNativeConfirmWorking === undefined) {
      this.addDebugLog('🧪 测试原生confirm可用性', 'info');
      try {
        // 创建一个短时间的测试
        const testStart = Date.now();
        const testResult = confirm('测试确认对话框（请点击取消）');
        const testDuration = Date.now() - testStart;
        
        // 如果confirm立即返回（小于100ms），可能是不正常的
        if (testDuration < 100) {
          this.addDebugLog(`⚠️ confirm立即返回（${testDuration}ms），可能不正常`, 'warn');
          this.isNativeConfirmWorking = false;
        } else {
          this.addDebugLog(`✅ confirm正常工作（${testDuration}ms）`, 'success');
          this.isNativeConfirmWorking = true;
        }
        
        this.addDebugLog(`📋 confirm测试结果: ${testResult}，耗时: ${testDuration}ms`, 'info');
      } catch (error) {
        this.addDebugLog(`❌ confirm测试失败: ${error.message}`, 'error');
        this.isNativeConfirmWorking = false;
      }
    }
    
    // 根据测试结果选择对话框
    if (this.isNativeConfirmWorking) {
      this.addDebugLog('✅ 使用原生confirm对话框', 'info');
      try {
        const result = confirm(message);
        this.addDebugLog(`🎭 原生confirm结果: ${result}`, 'info');
        return result;
      } catch (error) {
        this.addDebugLog(`❌ 原生confirm出错: ${error.message}`, 'error');
        this.isNativeConfirmWorking = false;
        // 降级到自定义对话框
      }
    }
    
    this.addDebugLog('🔄 使用自定义确认对话框', 'info');
    const result = await this.showCustomConfirm(message, title);
    this.addDebugLog(`🎭 自定义confirm结果: ${result}`, 'info');
    return result;
  }

  // 从本地存储加载书签 - 现在不再使用
  async loadBookmarksFromStorage() {
    // 这个方法现在不再使用，保留以防需要回退
    try {
      const result = await chrome.storage.local.get(['bookmarksData', 'nextId']);
      this.bookmarks = result.bookmarksData || [];
      this.nextId = result.nextId || 1;
      this.renderBookmarks();
    } catch (error) {
      console.error('加载书签失败:', error);
      this.showStatus('加载书签失败', 'error');
    }
  }

  // 获取Chrome浏览器书签
  async getChromeBookmarks() {
    console.log('📚 getChromeBookmarks 开始');
    console.log('🌐 当前浏览器信息:', this.browserInfo);
    
    // 检查API可用性
    if (!chrome?.bookmarks?.getTree) {
      console.error('❌ chrome.bookmarks.getTree API不可用');
      this.showStatus('❌ 当前浏览器不支持书签读取功能', 'error');
      return [];
    }
    
    try {
      console.log('📞 调用chrome.bookmarks.getTree API');
      
      // 添加超时处理
      const getTreePromise = chrome.bookmarks.getTree();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('获取书签树超时')), 10000);
      });
      
      const bookmarkTree = await Promise.race([getTreePromise, timeoutPromise]);
      console.log('✅ Chrome书签树获取成功，根节点数量:', bookmarkTree.length);
      
      const processedBookmarks = this.processChromeBookmarkTree(bookmarkTree);
      console.log('📊 处理后的书签数量:', processedBookmarks.length);
      
      return processedBookmarks;
    } catch (error) {
      console.error('❌ 获取Chrome书签失败:', error);
      console.error('❌ 错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        browserType: this.browserInfo?.type
      });
      
      // 针对不同错误类型的处理
      if (error.message.includes('timeout') || error.message.includes('超时')) {
        this.showStatus('❌ 获取书签超时，请重试', 'error');
      } else if (error.message.includes('Extension context invalidated')) {
        this.showStatus('❌ 扩展上下文失效，请重新加载扩展', 'error');
      } else if (error.message.includes('Permission')) {
        this.showStatus('❌ 权限不足，无法访问浏览器书签', 'error');
      } else {
        this.showStatus(`❌ 获取书签失败: ${error.message}`, 'error');
      }
      
      return [];
    }
  }

  // 处理Chrome书签树
  processChromeBookmarkTree(nodes) {
    const results = [];
    for (const node of nodes) {
      // 跳过根节点（id为'0'）
      if (node.id === '0') {
        if (node.children) {
          results.push(...this.processChromeBookmarkTree(node.children));
        }
        continue;
      }
      
      // 处理有标题的节点
      if (node.title) {
        const processedNode = {
          id: node.id,
          parentId: node.parentId,
          title: node.title,
          url: node.url,
          dateAdded: node.dateAdded,
          children: node.children ? this.processChromeBookmarkTree(node.children) : [],
          isFolder: !node.url,
          isChromeBookmark: true // 标记为Chrome书签
        };
        results.push(processedNode);
      }
    }
    return results;
  }

  // 删除Chrome浏览器书签
  async deleteChromeBookmark(bookmarkId) {
    this.addDebugLog(`🗑️ deleteChromeBookmark 开始，bookmarkId: ${bookmarkId}`, 'info');
    this.addDebugLog(`🌐 当前浏览器信息: ${JSON.stringify(this.browserInfo)}`, 'info');
    
    // 检查API可用性
    if (!chrome?.bookmarks?.remove) {
      this.addDebugLog('❌ chrome.bookmarks.remove API不可用', 'error');
      this.showStatus('❌ 当前浏览器不支持书签删除功能', 'error');
      return false;
    }
    
    try {
      this.addDebugLog('📞 调用chrome.bookmarks.remove API', 'info');
      
      // 添加超时处理，防止API无响应
      const deletePromise = chrome.bookmarks.remove(bookmarkId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API调用超时')), 10000); // 10秒超时
      });
      
      await Promise.race([deletePromise, timeoutPromise]);
      
      this.addDebugLog('✅ Chrome书签删除API调用成功', 'success');
      this.showStatus('✅ Chrome书签删除成功', 'success');
      return true;
    } catch (error) {
      this.addDebugLog(`❌ 删除Chrome书签失败: ${error.message}`, 'error');
      this.addDebugLog(`❌ 错误详情: ${JSON.stringify({
        message: error.message,
        stack: error.stack,
        name: error.name,
        bookmarkId: bookmarkId,
        browserType: this.browserInfo?.type
      })}`, 'error');
      
      // 更详细的错误处理
      if (error.message.includes('timeout') || error.message.includes('超时')) {
        this.showStatus('❌ 删除操作超时，请重试', 'error');
      } else if (error.message.includes('not found')) {
        this.showStatus('❌ 书签不存在，可能已被删除', 'error');
      } else if (error.message.includes('Cannot remove') || error.message.includes('Permission')) {
        this.showStatus('❌ 无法删除此书签（权限不足）', 'error');
      } else if (error.message.includes('Extension context invalidated')) {
        this.showStatus('❌ 扩展上下文失效，请重新加载扩展', 'error');
      } else {
        this.showStatus(`❌ 删除失败: ${error.message}`, 'error');
      }
      return false;
    }
  }

  // 删除Chrome文件夹（包含子项）
  async deleteChromeFolderRecursively(folderId) {
    console.log('🗑️📁 deleteChromeFolderRecursively 开始，folderId:', folderId);
    console.log('🌐 当前浏览器信息:', this.browserInfo);
    
    // 检查API可用性
    if (!chrome?.bookmarks?.removeTree) {
      console.error('❌ chrome.bookmarks.removeTree API不可用');
      this.showStatus('❌ 当前浏览器不支持文件夹删除功能', 'error');
      return false;
    }
    
    try {
      console.log('📞 调用chrome.bookmarks.removeTree API');
      
      // 添加超时处理
      const deletePromise = chrome.bookmarks.removeTree(folderId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API调用超时')), 15000); // 文件夹删除给更长超时时间
      });
      
      await Promise.race([deletePromise, timeoutPromise]);
      
      console.log('✅ Chrome文件夹删除API调用成功');
      this.showStatus('✅ Chrome文件夹删除成功', 'success');
      return true;
    } catch (error) {
      console.error('❌ 删除Chrome文件夹失败:', error);
      console.error('❌ 错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        folderId: folderId,
        browserType: this.browserInfo?.type
      });
      
      // 更详细的错误处理
      if (error.message.includes('timeout') || error.message.includes('超时')) {
        this.showStatus('❌ 删除操作超时，请重试', 'error');
      } else if (error.message.includes('not found')) {
        this.showStatus('❌ 文件夹不存在，可能已被删除', 'error');
      } else if (error.message.includes('Cannot remove') || error.message.includes('Permission')) {
        this.showStatus('❌ 无法删除此文件夹（权限不足或系统文件夹）', 'error');
      } else if (error.message.includes('Extension context invalidated')) {
        this.showStatus('❌ 扩展上下文失效，请重新加载扩展', 'error');
      } else {
        this.showStatus(`❌ 删除失败: ${error.message}`, 'error');
      }
      return false;
    }
  }

  // 保存书签到本地存储
  async saveBookmarksToStorage() {
    try {
      await chrome.storage.local.set({
        bookmarksData: this.bookmarks,
        nextId: this.nextId
      });
    } catch (error) {
      console.error('保存书签失败:', error);
      this.showStatus('保存书签失败', 'error');
    }
  }

  // 生成唯一ID
  generateId() {
    return String(this.nextId++);
  }

  // 加载书签 - 恢复为独立存储
  async loadBookmarks() {
    await this.loadBookmarksFromStorage();
  }

  // 处理书签树结构 - 现在不需要，因为我们不再从Chrome获取
  processBookmarkTree(nodes) {
    return nodes.map(node => ({
      id: node.id || this.generateId(),
      parentId: node.parentId,
      title: node.title,
      url: node.url,
      dateAdded: node.dateAdded || Date.now(),
      children: node.children ? this.processBookmarkTree(node.children) : [],
      isFolder: !node.url
    }));
  }

  // 渲染书签列表
  renderBookmarks(searchResults = null) {
    console.log('🎨 renderBookmarks 开始，搜索结果:', searchResults ? '有' : '无');
    const container = document.getElementById('bookmarkTree');
    const emptyState = document.getElementById('emptyState');
    
    const bookmarksToRender = searchResults || this.bookmarks;
    console.log('📊 准备渲染书签数量:', bookmarksToRender.length);
    
    if (bookmarksToRender.length === 0) {
      console.log('📭 书签列表为空，显示空状态');
      container.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }
    
    console.log('📝 开始生成书签HTML');
    emptyState.style.display = 'none';
    container.innerHTML = this.renderBookmarkNodes(bookmarksToRender);
    
    console.log('🔗 重新绑定书签事件');
    // 绑定点击事件
    this.bindBookmarkEvents();
    console.log('✅ renderBookmarks 完成');
  }

  // 渲染书签节点
  renderBookmarkNodes(nodes, level = 0) {
    return nodes.map(node => {
      const isExpanded = this.expandedFolders.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const isHighlighted = this.searchQuery && 
        node.title.toLowerCase().includes(this.searchQuery.toLowerCase());

      // 简化图标处理，避免favicon加载错误
      let iconHtml = node.isFolder ? '📁' : '🔗';
      
      // 如果是Chrome书签，添加特殊标识
      if (node.isChromeBookmark) {
        iconHtml = node.isFolder ? '📁🌐' : '🔗🌐';
      }

      const childrenHtml = hasChildren && (isExpanded || this.searchQuery) ?
        `<div class="folder-children ${!isExpanded && !this.searchQuery ? 'collapsed' : ''}">
          ${this.renderBookmarkNodes(node.children, level + 1)}
        </div>` : '';

      return `
        <div class="bookmark-node" data-id="${node.id}">
          <div class="bookmark-item ${isHighlighted ? 'highlighted' : ''} ${node.isChromeBookmark ? 'chrome-bookmark' : ''}" 
               data-id="${node.id}" data-url="${node.url || ''}" 
               data-title="${node.title}" data-is-folder="${node.isFolder}"
               data-is-chrome-bookmark="${node.isChromeBookmark || false}">
            ${hasChildren ? 
              `<span class="folder-toggle ${isExpanded ? 'expanded' : ''}" data-id="${node.id}">▶</span>` : 
              '<span class="folder-toggle"></span>'
            }
            <div class="bookmark-icon ${node.isFolder ? 'folder' : 'link'}">
              ${iconHtml}
            </div>
            <span class="bookmark-title">${node.title}</span>
            ${node.url ? `<span class="bookmark-url">${this.getDomain(node.url)}</span>` : ''}
            ${node.isChromeBookmark ? '<span class="chrome-badge">Chrome</span>' : ''}
          </div>
          ${childrenHtml}
        </div>
      `;
    }).join('');
  }

  // 绑定书签事件
  bindBookmarkEvents() {
    // 文件夹展开/收起
    document.querySelectorAll('.folder-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = toggle.dataset.id;
        if (id) {
          this.toggleFolder(id);
        }
      });
    });

    // 书签点击
    document.querySelectorAll('.bookmark-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('folder-toggle')) return;
        
        const url = item.dataset.url;
        const isFolder = item.dataset.isFolder === 'true';
        
        if (url && !isFolder) {
          chrome.tabs.create({ url });
        } else if (isFolder) {
          const id = item.dataset.id;
          this.toggleFolder(id);
        }
      });
    });
  }

  // 切换文件夹展开状态
  toggleFolder(folderId) {
    if (this.expandedFolders.has(folderId)) {
      this.expandedFolders.delete(folderId);
    } else {
      this.expandedFolders.add(folderId);
    }
    
    this.saveExpandedState();
    this.renderBookmarks();
  }

  // 处理搜索
  handleSearch(query) {
    this.searchQuery = query.trim();
    const clearBtn = document.getElementById('clearSearch');
    
    if (this.searchQuery) {
      clearBtn.style.display = 'block';
      const results = this.searchBookmarks(this.bookmarks, this.searchQuery);
      this.renderBookmarks(results);
    } else {
      clearBtn.style.display = 'none';
      this.renderBookmarks();
    }
  }

  // 搜索书签
  searchBookmarks(nodes, query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    for (const node of nodes) {
      const titleMatch = node.title.toLowerCase().includes(lowerQuery);
      const urlMatch = node.url && node.url.toLowerCase().includes(lowerQuery);
      
      if (titleMatch || urlMatch) {
        results.push(node);
      }
      
      if (node.children) {
        const childResults = this.searchBookmarks(node.children, query);
        results.push(...childResults);
      }
    }
    
    return results;
  }

  // 显示右键菜单
  showContextMenu(event, target) {
    this.addDebugLog('🖱️ showContextMenu 被调用', 'info');
    this.addDebugLog(`🎯 右键目标: ${JSON.stringify({
      id: target.dataset.id,
      title: target.dataset.title,
      isFolder: target.dataset.isFolder,
      isChromeBookmark: target.dataset.isChromeBookmark,
      url: target.dataset.url
    })}`, 'info');
    
    const menu = document.getElementById('contextMenu');
    const isFolder = target.dataset.isFolder === 'true';
    const hasUrl = target.dataset.url;
    const isChromeBookmark = target.dataset.isChromeBookmark === 'true';
    
    // 根据类型显示/隐藏菜单项
    const openItem = menu.querySelector('[data-action="open"]');
    const openNewTabItem = menu.querySelector('[data-action="open-new-tab"]');
    const editItem = menu.querySelector('[data-action="edit"]');
    const deleteItem = menu.querySelector('[data-action="delete"]');
    const chromeDeleteItem = menu.querySelector('[data-action="delete-chrome"]');
    const deleteText = deleteItem.querySelector('.delete-text');
    
    this.addDebugLog(`📋 菜单项元素检查: ${JSON.stringify({
      openItem: !!openItem,
      openNewTabItem: !!openNewTabItem,
      editItem: !!editItem,
      deleteItem: !!deleteItem,
      chromeDeleteItem: !!chromeDeleteItem,
      deleteText: !!deleteText
    })}`, 'info');
    
    // 显示/隐藏打开相关菜单
    if (isFolder || !hasUrl) {
      openItem.style.display = 'none';
      openNewTabItem.style.display = 'none';
      this.addDebugLog('📁 隐藏打开菜单项（文件夹或无URL）', 'info');
    } else {
      openItem.style.display = 'flex';
      openNewTabItem.style.display = 'flex';
      this.addDebugLog('🔗 显示打开菜单项', 'info');
    }
    
    // 根据书签类型调整菜单项
    if (isChromeBookmark) {
      // Chrome书签：禁用编辑，显示警告删除
      editItem.style.display = 'none';
      deleteText.textContent = '删除（危险）';
      deleteText.style.color = '#dc3545';
      chromeDeleteItem.style.display = 'flex';
      this.addDebugLog('🌐 配置Chrome书签菜单', 'info');
    } else {
      // 插件书签：正常显示
      editItem.style.display = 'flex';
      deleteText.textContent = '删除';
      deleteText.style.color = '';
      chromeDeleteItem.style.display = 'none';
      this.addDebugLog('⭐ 配置插件书签菜单', 'info');
    }
    
    this.contextMenuTarget = target;
    
    // 定位菜单
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    this.addDebugLog(`📍 菜单定位: {x: ${event.pageX}, y: ${event.pageY}}`, 'info');
    
    // 确保菜单不超出视窗
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (event.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (event.pageY - rect.height) + 'px';
    }
    
    this.addDebugLog('✅ 右键菜单显示完成', 'success');
    
    // DIA浏览器兼容性：每次显示菜单时重新绑定直接事件
    this.bindDirectMenuEvents();
  }

  // 隐藏右键菜单
  hideContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
    this.contextMenuTarget = null;
  }

  // 处理右键菜单操作
  async handleContextMenuAction(action) {
    this.addDebugLog(`🎯 handleContextMenuAction 被调用, action: ${action}`, 'info');
    
    if (!this.contextMenuTarget) {
      this.addDebugLog('❌ 没有contextMenuTarget，退出', 'warn');
      return;
    }
    
    const id = this.contextMenuTarget.dataset.id;
    const url = this.contextMenuTarget.dataset.url;
    const title = this.contextMenuTarget.dataset.title;
    const isFolder = this.contextMenuTarget.dataset.isFolder === 'true';
    const isChromeBookmark = this.contextMenuTarget.dataset.isChromeBookmark === 'true';
    
    this.addDebugLog(`📊 右键菜单目标数据: ${JSON.stringify({
      id, url, title, isFolder, isChromeBookmark, currentMode: this.currentMode
    })}`, 'info');
    
    this.hideContextMenu();
    
    try {
      switch (action) {
        case 'open':
          this.addDebugLog('🔗 执行打开操作', 'info');
          if (url) chrome.tabs.update({ url });
          break;
          
        case 'open-new-tab':
          this.addDebugLog('📑 执行新标签页打开操作', 'info');
          if (url) chrome.tabs.create({ url });
          break;
          
        case 'edit':
          this.addDebugLog('✏️ 执行编辑操作', 'info');
          this.showEditModal(id, title, url, isFolder);
          break;
          
        case 'delete':
          this.addDebugLog(`🗑️ 执行删除操作，isChromeBookmark: ${isChromeBookmark}`, 'info');
          
          if (isChromeBookmark) {
            // 删除Chrome书签
            const confirmMessage = isFolder 
              ? `确定要删除Chrome文件夹 "${title}" 及其所有子项吗？` 
              : `确定要删除Chrome书签 "${title}" 吗？`;
            
            this.addDebugLog('💬 显示Chrome书签删除确认对话框', 'info');
            
            // 使用兼容性确认对话框
            let userConfirmed = false;
            try {
              userConfirmed = await this.compatibleConfirm(confirmMessage, '删除Chrome书签');
              this.addDebugLog(`🎭 用户确认结果: ${userConfirmed}`, 'info');
            } catch (error) {
              this.addDebugLog(`❌ 确认对话框出错: ${error.message}`, 'error');
              return;
            }
            
            if (userConfirmed) {
              this.addDebugLog('✅ 用户确认删除Chrome书签，开始执行删除', 'info');
              const success = isFolder 
                ? await this.deleteChromeFolderRecursively(id)
                : await this.deleteChromeBookmark(id);
              
              this.addDebugLog(`🔄 删除结果: ${success}，当前模式: ${this.currentMode}`, 'info');
              if (success) {
                // 重新加载当前显示模式
                if (this.currentMode === 'chrome') {
                  this.addDebugLog('🔄 重新加载Chrome书签', 'info');
                  await this.loadChromeBookmarks();
                } else {
                  this.addDebugLog('⚠️ 当前不是Chrome模式，但删除了Chrome书签', 'warn');
                }
                // 确保界面立即更新
                this.addDebugLog('🎨 强制重新渲染界面', 'info');
                this.renderBookmarks();
              }
            } else {
              this.addDebugLog('❌ 用户取消删除Chrome书签', 'info');
            }
          } else {
            // 删除插件书签
            this.addDebugLog('💬 显示插件书签删除确认对话框', 'info');
            
            let userConfirmed = false;
            try {
              userConfirmed = await this.compatibleConfirm(`确定要删除 "${title}" 吗？`, '删除插件书签');
              this.addDebugLog(`🎭 用户确认结果: ${userConfirmed}`, 'info');
            } catch (error) {
              this.addDebugLog(`❌ 确认对话框出错: ${error.message}`, 'error');
              return;
            }
            
            if (userConfirmed) {
              this.addDebugLog('✅ 用户确认删除插件书签，开始执行删除', 'info');
              await this.deleteBookmark(id);
              this.addDebugLog('🔄 重新加载插件书签', 'info');
              await this.loadBookmarks();
              // 确保界面立即更新
              this.addDebugLog('🎨 强制重新渲染界面', 'info');
              this.renderBookmarks();
              this.showStatus('删除成功');
            } else {
              this.addDebugLog('❌ 用户取消删除插件书签', 'info');
            }
          }
          break;
          
        case 'delete-chrome':
          this.addDebugLog('🗑️💀 执行专门的Chrome书签删除操作', 'info');
          // 专门的删除Chrome书签菜单项
          const confirmMessage = isFolder 
            ? `确定要从Chrome中删除文件夹 "${title}" 及其所有子项吗？此操作不可撤销！` 
            : `确定要从Chrome中删除书签 "${title}" 吗？此操作不可撤销！`;
          
          this.addDebugLog('💬 显示Chrome书签危险删除确认对话框', 'info');
          
          let userConfirmed = false;
          try {
            userConfirmed = await this.compatibleConfirm(confirmMessage, '危险操作：删除Chrome书签');
            this.addDebugLog(`🎭 用户确认结果: ${userConfirmed}`, 'info');
          } catch (error) {
            this.addDebugLog(`❌ 确认对话框出错: ${error.message}`, 'error');
            return;
          }
          
          if (userConfirmed) {
            this.addDebugLog('✅ 用户确认危险删除Chrome书签，开始执行删除', 'info');
            const success = isFolder 
              ? await this.deleteChromeFolderRecursively(id)
              : await this.deleteChromeBookmark(id);
            
            this.addDebugLog(`🔄 删除结果: ${success}，当前模式: ${this.currentMode}`, 'info');
            if (success) {
              // 重新加载Chrome书签显示
              if (this.currentMode === 'chrome') {
                this.addDebugLog('🔄 重新加载Chrome书签显示', 'info');
                await this.loadChromeBookmarks();
              }
              // 确保界面立即更新
              this.addDebugLog('🎨 强制重新渲染界面', 'info');
              this.renderBookmarks();
            }
          } else {
            this.addDebugLog('❌ 用户取消危险删除Chrome书签', 'info');
          }
          break;
          
        case 'create-folder':
          this.addDebugLog('📁 执行创建文件夹操作', 'info');
          this.showEditModal(null, '', '', true, id);
          break;
          
        default:
          this.addDebugLog(`❓ 未知的操作: ${action}`, 'warn');
      }
    } catch (error) {
      this.addDebugLog(`💥 操作失败: ${error.message}`, 'error');
      this.showStatus('操作失败', 'error');
    }
  }

  // 显示编辑模态框
  showEditModal(id, title, url, isFolder, parentId = null) {
    const modal = document.getElementById('editModal');
    const modalTitle = document.getElementById('editModalTitle');
    const titleInput = document.getElementById('editTitle');
    const urlInput = document.getElementById('editUrl');
    const urlGroup = document.getElementById('editUrlGroup');
    
    this.currentEditingId = id;
    this.currentEditingParentId = parentId;
    this.isEditingFolder = isFolder;
    
    modalTitle.textContent = id ? 
      (isFolder ? '编辑文件夹' : '编辑书签') : 
      (isFolder ? '新建文件夹' : '新建书签');
    
    titleInput.value = title;
    urlInput.value = url || '';
    
    // 文件夹不显示URL字段
    urlGroup.style.display = isFolder ? 'none' : 'block';
    
    modal.style.display = 'flex';
    titleInput.focus();
  }

  // 保存书签编辑
  async saveBookmarkEdit() {
    const title = document.getElementById('editTitle').value.trim();
    const url = document.getElementById('editUrl').value.trim();
    
    if (!title) {
      this.showStatus('请输入标题', 'error');
      return;
    }
    
    if (!this.isEditingFolder && url && !this.isValidUrl(url)) {
      this.showStatus('请输入有效的URL', 'error');
      return;
    }
    
    try {
      if (this.currentEditingId) {
        // 更新现有书签
        const updateData = { title };
        if (!this.isEditingFolder && url) {
          updateData.url = url;
        }
        
        await this.updateBookmark(this.currentEditingId, updateData);
        this.showStatus('更新成功');
      } else {
        // 创建新书签/文件夹
        const createData = {
          title,
          parentId: this.currentEditingParentId || '1' // 默认添加到书签栏
        };
        
        if (!this.isEditingFolder && url) {
          createData.url = url;
        }
        
        await this.addBookmark(createData);
        this.showStatus(this.isEditingFolder ? '文件夹创建成功' : '书签创建成功');
      }
      
      // 关闭模态框并刷新
      document.getElementById('editModal').style.display = 'none';
      await this.loadBookmarks();
      
    } catch (error) {
      console.error('保存失败:', error);
      this.showStatus('保存失败', 'error');
    }
  }

  // 添加当前标签页为书签
  async addCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const newBookmark = {
        id: this.generateId(),
        title: tab.title,
        url: tab.url,
        dateAdded: Date.now(),
        isFolder: false,
        children: []
      };
      
      this.bookmarks.push(newBookmark);
      await this.saveBookmarksToStorage();
      this.renderBookmarks();
      this.showStatus('✅ 书签添加成功', 'success');
    } catch (error) {
      console.error('添加书签失败:', error);
      this.showStatus('❌ 添加书签失败', 'error');
    }
  }

  // 文件导入处理 - 混合方案：稳定解析 + 独立存储
  async handleFileImport(file) {
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.html')) {
      this.showStatus('请选择HTML格式的书签文件', 'error');
      return;
    }
    
    try {
      this.showLoading();
      this.showStatus('正在读取文件...', 'info');
      
      const content = await this.readFileAsText(file);
      this.showStatus('正在解析书签...', 'info');
      
      console.log('文件内容长度:', content.length);
      
      // 使用改进的解析逻辑
      const importedBookmarks = this.parseBookmarkHTML(content);
      
      if (importedBookmarks.length === 0) {
        this.showStatus('未找到有效的书签数据', 'error');
        this.hideLoading();
        return;
      }
      
      const totalBookmarks = this.countBookmarks(importedBookmarks);
      this.showStatus(`解析完成，准备导入 ${totalBookmarks} 个书签...`, 'info');
      
      // 为每个书签分配新的ID
      this.assignIds(importedBookmarks);
      
      // 创建导入文件夹（存储在插件内部）
      const importFolderName = `导入书签 ${new Date().toLocaleString()}`;
      const importFolder = {
        id: this.generateId(),
        title: importFolderName,
        url: null,
        dateAdded: Date.now(),
        isFolder: true,
        children: importedBookmarks
      };
      
      console.log('创建导入文件夹:', importFolderName);
      
      // 添加到插件的书签列表（不影响Chrome书签）
      this.bookmarks.push(importFolder);
      await this.saveBookmarksToStorage();
      
      this.showStatus(`✅ 导入完成！成功导入 ${totalBookmarks} 个书签到插件`, 'success');
      
      // 展开新创建的导入文件夹
      this.expandedFolders.add(importFolder.id);
      this.saveExpandedState();
      this.renderBookmarks();
      
    } catch (error) {
      console.error('导入失败:', error);
      this.showStatus('❌ 导入失败: ' + error.message, 'error');
    } finally {
      this.hideLoading();
      // 清空文件输入
      document.getElementById('importInput').value = '';
    }
  }

  // 为书签分配ID
  assignIds(bookmarks) {
    for (const bookmark of bookmarks) {
      bookmark.id = this.generateId();
      if (bookmark.children && bookmark.children.length > 0) {
        this.assignIds(bookmark.children);
      }
    }
  }

  // 改进的HTML解析方法 - 混合方案
  parseBookmarkHTML(htmlContent) {
    try {
      console.log('=== 开始解析HTML书签文件 ===');
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // 查找根DL元素
      const rootDL = doc.querySelector('dl');
      if (!rootDL) {
        throw new Error('未找到书签根节点 <dl>');
      }
      
      const result = this.parseBookmarkElements(rootDL);
      console.log('=== 解析完成 ===');
      console.log('解析结果:', result);
      
      return result;
      
    } catch (error) {
      console.error('解析HTML时出错:', error);
      throw error;
    }
  }

  // 改进的递归解析书签元素 - 修复嵌套问题
  parseBookmarkElements(dlElement) {
    const bookmarks = [];
    const children = Array.from(dlElement.children);
    
    console.log(`当前级别有 ${children.length} 个子元素`);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      
      if (child.tagName === 'DT') {
        // 优先检查文件夹（H3标签）- 使用直接子元素查找
        let folderTitle = null;
        for (const dtChild of child.children) {
          if (dtChild.tagName === 'H3') {
            folderTitle = dtChild;
            break;
          }
        }
        
        if (folderTitle) {
          const folder = {
            title: folderTitle.textContent.trim() || '未命名文件夹',
            url: null,
            dateAdded: this.parseDate(folderTitle.getAttribute('ADD_DATE')),
            isFolder: true,
            children: []
          };
          
          console.log(`发现文件夹: "${folder.title}"`);
          
          // 查找DT内部的DL子元素
          let subDL = null;
          for (const dtChild of child.children) {
            if (dtChild.tagName === 'DL') {
              subDL = dtChild;
              break;
            }
          }
          
          if (subDL) {
            console.log(`  -> 找到子DL，解析子项目`);
            folder.children = this.parseBookmarkElements(subDL);
            console.log(`  -> 文件夹包含 ${folder.children.length} 个子项目`);
          } else {
            console.log(`  -> 未找到子DL`);
          }
          
          bookmarks.push(folder);
          console.log(`添加文件夹: "${folder.title}" (${folder.children.length} 个子项目)`);
          continue;
        }
        
        // 检查书签链接（A标签）- 使用直接子元素查找
        let link = null;
        for (const dtChild of child.children) {
          if (dtChild.tagName === 'A' && dtChild.href && dtChild.href !== 'javascript:void(0)') {
            link = dtChild;
            break;
          }
        }
        
        if (link) {
          const bookmark = {
            title: link.textContent.trim() || link.href,
            url: link.href,
            dateAdded: this.parseDate(link.getAttribute('ADD_DATE')),
            isFolder: false,
            children: []
          };
          bookmarks.push(bookmark);
          console.log(`添加书签: "${bookmark.title}"`);
        }
      }
    }
    
    console.log(`本级别解析出 ${bookmarks.length} 个项目`);
    return bookmarks;
  }

  // 解析时间戳
  parseDate(addDate) {
    if (addDate) {
      return parseInt(addDate) * 1000; // Chrome使用秒，我们需要毫秒
    }
    return Date.now();
  }

  // 统计书签数量 - 改进版本
  countBookmarks(bookmarks) {
    let count = 0;
    for (const bookmark of bookmarks) {
      if (!bookmark.isFolder) {
        count++;
      }
      if (bookmark.children && bookmark.children.length > 0) {
        count += this.countBookmarks(bookmark.children);
      }
    }
    return count;
  }

  // 键盘快捷键处理
  handleKeydown(event) {
    // Ctrl/Cmd + F 聚焦搜索框
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      document.getElementById('searchInput').focus();
    }
    
    // Escape 关闭模态框和菜单
    if (event.key === 'Escape') {
      document.getElementById('editModal').style.display = 'none';
      document.getElementById('confirmModal').style.display = 'none';
      this.hideContextMenu();
    }
  }

  // 工具函数
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  showStatus(message, type = 'success') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message show ${type}`;
    
    console.log(`[状态] ${type.toUpperCase()}: ${message}`);
    
    // info类型的消息不自动消失
    if (type !== 'info') {
      setTimeout(() => {
        statusEl.classList.remove('show');
      }, 3000);
    }
  }

  showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('bookmarkTree').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
  }

  hideLoading() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('bookmarkTree').style.display = 'block';
  }

  // 保存展开状态
  async saveExpandedState() {
    try {
      await chrome.storage.local.set({
        expandedFolders: Array.from(this.expandedFolders)
      });
    } catch (error) {
      console.warn('保存展开状态失败:', error);
    }
  }

  // 加载展开状态
  async loadExpandedState() {
    try {
      const result = await chrome.storage.local.get('expandedFolders');
      if (result.expandedFolders) {
        this.expandedFolders = new Set(result.expandedFolders);
      }
    } catch (error) {
      console.warn('加载展开状态失败:', error);
    }
  }

  // 删除书签
  async deleteBookmark(id) {
    this.bookmarks = this.removeBookmarkById(this.bookmarks, id);
    await this.saveBookmarksToStorage();
  }

  // 递归删除书签
  removeBookmarkById(bookmarks, id) {
    return bookmarks.filter(bookmark => {
      if (bookmark.id === id) {
        return false;
      }
      if (bookmark.children && bookmark.children.length > 0) {
        bookmark.children = this.removeBookmarkById(bookmark.children, id);
      }
      return true;
    });
  }

  // 更新书签
  async updateBookmark(id, updateData) {
    this.updateBookmarkById(this.bookmarks, id, updateData);
    await this.saveBookmarksToStorage();
  }

  // 递归更新书签
  updateBookmarkById(bookmarks, id, updateData) {
    for (const bookmark of bookmarks) {
      if (bookmark.id === id) {
        Object.assign(bookmark, updateData);
        return true;
      }
      if (bookmark.children && bookmark.children.length > 0) {
        if (this.updateBookmarkById(bookmark.children, id, updateData)) {
          return true;
        }
      }
    }
    return false;
  }

  // 添加书签
  async addBookmark(createData) {
    const newBookmark = {
      id: this.generateId(),
      dateAdded: Date.now(),
      isFolder: !createData.url,
      children: [],
      ...createData
    };

    if (createData.parentId && createData.parentId !== '1') {
      // 添加到指定父文件夹
      this.addBookmarkToParent(this.bookmarks, createData.parentId, newBookmark);
    } else {
      // 添加到根级别
      this.bookmarks.push(newBookmark);
    }
    
    await this.saveBookmarksToStorage();
  }

  // 递归添加书签到父文件夹
  addBookmarkToParent(bookmarks, parentId, newBookmark) {
    for (const bookmark of bookmarks) {
      if (bookmark.id === parentId && bookmark.isFolder) {
        bookmark.children.push(newBookmark);
        return true;
      }
      if (bookmark.children && bookmark.children.length > 0) {
        if (this.addBookmarkToParent(bookmark.children, parentId, newBookmark)) {
          return true;
        }
      }
    }
    return false;
  }

  // 加载Chrome书签
  async loadChromeBookmarks() {
    console.log('📚 loadChromeBookmarks 开始');
    try {
      this.showLoading();
      this.showStatus('正在加载Chrome书签...', 'info');
      
      const chromeBookmarks = await this.getChromeBookmarks();
      console.log('📊 获取到Chrome书签数量:', chromeBookmarks.length);
      this.bookmarks = chromeBookmarks;
      
      this.showStatus('Chrome书签加载成功', 'success');
      console.log('🎨 开始渲染Chrome书签');
      this.renderBookmarks();
      console.log('✅ Chrome书签加载和渲染完成');
    } catch (error) {
      console.error('❌ 加载Chrome书签失败:', error);
      this.showStatus('加载Chrome书签失败', 'error');
    } finally {
      this.hideLoading();
    }
  }

  // 切换显示模式
  async toggleDisplayMode() {
    this.addDebugLog(`🔄 toggleDisplayMode被调用，当前模式: ${this.currentMode}`, 'info');
    const toggleBtn = document.getElementById('toggleModeBtn');
    
    if (this.currentMode === 'plugin') {
      // 切换到Chrome书签模式
      this.currentMode = 'chrome';
      // 只更新文本节点，保留图标
      toggleBtn.innerHTML = '<span class="icon">🔄</span>Chrome书签';
      await this.loadChromeBookmarks();
      this.showStatus('已切换到Chrome书签模式', 'success');
    } else {
      // 切换到插件书签模式
      this.currentMode = 'plugin';
      // 只更新文本节点，保留图标
      toggleBtn.innerHTML = '<span class="icon">🔄</span>插件书签';
      await this.loadBookmarksFromStorage();
      this.showStatus('已切换到插件书签模式', 'success');
    }
    
    this.renderBookmarks();
  }

  // 可视化日志系统
  addDebugLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      message,
      level
    };
    
    this.debugLogs.push(logEntry);
    
    // 限制日志数量
    if (this.debugLogs.length > this.maxDebugLogs) {
      this.debugLogs = this.debugLogs.slice(-this.maxDebugLogs);
    }
    
    // 更新可视化日志显示
    this.updateDebugDisplay();
    
    // 同时保留控制台输出（如果可用）
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    if (console && console[consoleMethod]) {
      console[consoleMethod](`[${timestamp}] ${message}`);
    }
  }

  // 更新调试日志显示
  updateDebugDisplay() {
    const debugContent = document.getElementById('debugContent');
    if (!debugContent) return;
    
    const logsHtml = this.debugLogs.map(log => `
      <div class="debug-entry debug-level-${log.level}">
        <span class="debug-timestamp">${log.timestamp}</span> ${log.message}
      </div>
    `).join('');
    
    debugContent.innerHTML = logsHtml;
    // 滚动到底部显示最新日志
    debugContent.scrollTop = debugContent.scrollHeight;
  }

  // 清空调试日志
  clearDebugLog() {
    this.debugLogs = [];
    this.updateDebugDisplay();
    this.addDebugLog('📝 调试日志已清空', 'info');
  }

  // 直接绑定菜单项事件（DIA浏览器兼容性）
  bindDirectMenuEvents() {
    this.addDebugLog('🔧 绑定直接菜单事件（DIA浏览器兼容性）', 'info');
    
    // 获取所有菜单项
    const menuItems = document.querySelectorAll('#contextMenu .menu-item');
    this.addDebugLog(`📋 找到 ${menuItems.length} 个菜单项`, 'info');
    
    menuItems.forEach((item, index) => {
      const action = item.dataset.action;
      this.addDebugLog(`📌 绑定菜单项 ${index}: action="${action}"`, 'info');
      
      // 移除之前的监听器（如果有）
      item.removeEventListener('click', this.handleDirectMenuClick.bind(this));
      
      // 添加新的监听器
      item.addEventListener('click', (e) => {
        this.addDebugLog(`🎯 直接菜单点击: action="${action}"`, 'info');
        e.preventDefault();
        e.stopPropagation();
        
        if (action) {
          this.handleContextMenuAction(action);
        } else {
          this.addDebugLog('❌ 直接菜单点击但没有action', 'error');
        }
      });
    });
    
    this.addDebugLog('✅ 直接菜单事件绑定完成', 'success');
  }

  // 处理直接菜单点击（DIA浏览器兼容性回调）
  handleDirectMenuClick(e) {
    const action = e.currentTarget.dataset.action;
    this.addDebugLog(`🎯 handleDirectMenuClick: action="${action}"`, 'info');
    
    e.preventDefault();
    e.stopPropagation();
    
    if (action) {
      this.handleContextMenuAction(action);
    }
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new BookmarkManager();
});