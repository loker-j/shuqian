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
    
    this.init();
  }

  // 初始化
  async init() {
    console.log('BookmarkManager初始化开始');
    this.bindEvents();
    await this.loadExpandedState();
    await this.loadBookmarksFromStorage(); // 恢复为本地存储
    this.hideLoading();
    console.log('BookmarkManager初始化完成');
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
      console.log('找到切换模式按钮，绑定事件');
      toggleModeBtn.addEventListener('click', () => {
        console.log('切换按钮被点击');
        this.toggleDisplayMode();
      });
    } else {
      console.error('未找到toggleModeBtn元素');
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
      const action = e.target.closest('.menu-item')?.dataset.action;
      if (action) {
        this.handleContextMenuAction(action);
      }
    });

    // 编辑模态框
    this.bindModalEvents();

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });
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
    try {
      const bookmarkTree = await chrome.bookmarks.getTree();
      return this.processChromeBookmarkTree(bookmarkTree);
    } catch (error) {
      console.error('获取Chrome书签失败:', error);
      this.showStatus('获取Chrome书签失败', 'error');
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
    try {
      await chrome.bookmarks.remove(bookmarkId);
      this.showStatus('✅ Chrome书签删除成功', 'success');
      return true;
    } catch (error) {
      console.error('删除Chrome书签失败:', error);
      if (error.message.includes('not found')) {
        this.showStatus('❌ 书签不存在，可能已被删除', 'error');
      } else if (error.message.includes('Cannot remove')) {
        this.showStatus('❌ 无法删除系统文件夹', 'error');
      } else {
        this.showStatus('❌ 删除Chrome书签失败', 'error');
      }
      return false;
    }
  }

  // 删除Chrome文件夹（包含子项）
  async deleteChromeFolderRecursively(folderId) {
    try {
      await chrome.bookmarks.removeTree(folderId);
      this.showStatus('✅ Chrome文件夹删除成功', 'success');
      return true;
    } catch (error) {
      console.error('删除Chrome文件夹失败:', error);
      if (error.message.includes('not found')) {
        this.showStatus('❌ 文件夹不存在，可能已被删除', 'error');
      } else if (error.message.includes('Cannot remove')) {
        this.showStatus('❌ 无法删除系统文件夹（如书签栏）', 'error');
      } else {
        this.showStatus('❌ 删除Chrome文件夹失败', 'error');
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
    const container = document.getElementById('bookmarkTree');
    const emptyState = document.getElementById('emptyState');
    
    const bookmarksToRender = searchResults || this.bookmarks;
    
    if (bookmarksToRender.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = this.renderBookmarkNodes(bookmarksToRender);
    
    // 绑定点击事件
    this.bindBookmarkEvents();
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
    
    // 显示/隐藏打开相关菜单
    if (isFolder || !hasUrl) {
      openItem.style.display = 'none';
      openNewTabItem.style.display = 'none';
    } else {
      openItem.style.display = 'flex';
      openNewTabItem.style.display = 'flex';
    }
    
    // 根据书签类型调整菜单项
    if (isChromeBookmark) {
      // Chrome书签：禁用编辑，显示警告删除
      editItem.style.display = 'none';
      deleteText.textContent = '删除（危险）';
      deleteText.style.color = '#dc3545';
      chromeDeleteItem.style.display = 'flex';
    } else {
      // 插件书签：正常显示
      editItem.style.display = 'flex';
      deleteText.textContent = '删除';
      deleteText.style.color = '';
      chromeDeleteItem.style.display = 'none';
    }
    
    this.contextMenuTarget = target;
    
    // 定位菜单
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    // 确保菜单不超出视窗
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (event.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (event.pageY - rect.height) + 'px';
    }
  }

  // 隐藏右键菜单
  hideContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
    this.contextMenuTarget = null;
  }

  // 处理右键菜单操作
  async handleContextMenuAction(action) {
    if (!this.contextMenuTarget) return;
    
    const id = this.contextMenuTarget.dataset.id;
    const url = this.contextMenuTarget.dataset.url;
    const title = this.contextMenuTarget.dataset.title;
    const isFolder = this.contextMenuTarget.dataset.isFolder === 'true';
    const isChromeBookmark = this.contextMenuTarget.dataset.isChromeBookmark === 'true';
    
    this.hideContextMenu();
    
    try {
      switch (action) {
        case 'open':
          if (url) chrome.tabs.update({ url });
          break;
          
        case 'open-new-tab':
          if (url) chrome.tabs.create({ url });
          break;
          
        case 'edit':
          this.showEditModal(id, title, url, isFolder);
          break;
          
        case 'delete':
          if (isChromeBookmark) {
            // 删除Chrome书签
            const confirmMessage = isFolder 
              ? `确定要删除Chrome文件夹 "${title}" 及其所有子项吗？` 
              : `确定要删除Chrome书签 "${title}" 吗？`;
            
            if (confirm(confirmMessage)) {
              const success = isFolder 
                ? await this.deleteChromeFolderRecursively(id)
                : await this.deleteChromeBookmark(id);
              
              if (success) {
                // 重新加载当前显示模式
                if (this.currentMode === 'chrome') {
                  await this.loadChromeBookmarks();
                }
              }
            }
          } else {
            // 删除插件书签
            if (confirm(`确定要删除 "${title}" 吗？`)) {
              await this.deleteBookmark(id);
              await this.loadBookmarks();
              this.showStatus('删除成功');
            }
          }
          break;
          
        case 'delete-chrome':
          // 专门的删除Chrome书签菜单项
          const confirmMessage = isFolder 
            ? `确定要从Chrome中删除文件夹 "${title}" 及其所有子项吗？此操作不可撤销！` 
            : `确定要从Chrome中删除书签 "${title}" 吗？此操作不可撤销！`;
          
          if (confirm(confirmMessage)) {
            const success = isFolder 
              ? await this.deleteChromeFolderRecursively(id)
              : await this.deleteChromeBookmark(id);
            
            if (success) {
              // 重新加载Chrome书签显示
              if (this.currentMode === 'chrome') {
                await this.loadChromeBookmarks();
              }
            }
          }
          break;
          
        case 'create-folder':
          this.showEditModal(null, '', '', true, id);
          break;
      }
    } catch (error) {
      console.error('操作失败:', error);
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
    try {
      this.showLoading();
      this.showStatus('正在加载Chrome书签...', 'info');
      
      const chromeBookmarks = await this.getChromeBookmarks();
      this.bookmarks = chromeBookmarks;
      
      this.showStatus('Chrome书签加载成功', 'success');
      this.renderBookmarks();
    } catch (error) {
      console.error('加载Chrome书签失败:', error);
      this.showStatus('加载Chrome书签失败', 'error');
    } finally {
      this.hideLoading();
    }
  }

  // 切换显示模式
  async toggleDisplayMode() {
    console.log('toggleDisplayMode被调用，当前模式:', this.currentMode);
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
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new BookmarkManager();
}); 