// 后台服务工作器 - 独立窗口模式
let bookmarkWindow = null;

console.log('🚀 后台脚本已加载 - 独立窗口模式');
console.log('📱 当前工作模式: 独立窗口模式');

chrome.runtime.onInstalled.addListener(() => {
  console.log('极简书签管理器已安装 - 独立窗口模式');
  
  // 清除旧的窗口设置，确保新设置生效
  chrome.storage.local.remove('windowSettings', () => {
    console.log('已清除旧的窗口设置');
    // 初始化新的窗口设置
    initializeWindowSettings();
  });
  
  // 设置右键菜单
  chrome.contextMenus.create({
    id: 'bookmark-this-page',
    title: '添加到书签',
    contexts: ['page']
  });
});

// 初始化窗口设置
async function initializeWindowSettings() {
  try {
    // 强制更新到新的默认设置，确保高度生效
    const newDefaultSettings = {
      width: 420,
      height: 2000,   // 用户设置的2000像素高度
      left: 50,        // 固定在左侧50像素
      top: 50          // 距离顶部50像素
    };
    
    await chrome.storage.local.set({ windowSettings: newDefaultSettings });
    console.log('已强制更新窗口设置:', newDefaultSettings);
  } catch (error) {
    console.error('初始化窗口设置失败:', error);
  }
}

// 处理插件图标点击 - 打开/聚焦独立窗口
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 添加屏幕信息检查
    console.log('=== 窗口创建调试信息 ===');
    console.log('Screen available size:', {
      width: screen.availWidth,
      height: screen.availHeight
    });
    
    await openBookmarkWindow();
  } catch (error) {
    console.error('打开书签窗口失败:', error);
  }
});

// 打开或聚焦书签管理窗口
async function openBookmarkWindow() {
  try {
    // 检查窗口是否已存在
    if (bookmarkWindow) {
      try {
        const window = await chrome.windows.get(bookmarkWindow.id);
        if (window) {
          // 窗口存在，聚焦到前台
          await chrome.windows.update(bookmarkWindow.id, { focused: true });
          console.log('已聚焦现有书签窗口');
          return;
        }
      } catch (error) {
        // 窗口不存在，创建新窗口
        bookmarkWindow = null;
      }
    }

    // 获取保存的窗口设置
    const { windowSettings } = await chrome.storage.local.get(['windowSettings']);
    
    // 简化位置计算，确保左侧显示
    const windowWidth = windowSettings.width || 420;
    const windowHeight = windowSettings.height || 2000;  // 确保默认高度为2000
    const leftPosition = 50;  // 固定左侧位置
    const topPosition = Math.max(50, windowSettings.top || 50);  // 确保不会太靠上
    
    console.log('创建窗口参数:', {
      width: windowWidth,
      height: windowHeight,
      left: leftPosition,
      top: topPosition
    });
    
    // 创建新的独立窗口
    bookmarkWindow = await chrome.windows.create({
      url: chrome.runtime.getURL('popup/popup.html'),
      type: 'popup',
      width: windowWidth,
      height: windowHeight,
      left: leftPosition,
      top: topPosition,
      focused: true
    });

    console.log('已创建新的书签管理窗口:', bookmarkWindow);
    console.log('请求的窗口大小:', { width: windowWidth, height: windowHeight });
    console.log('实际创建的窗口大小:', { width: bookmarkWindow.width, height: bookmarkWindow.height });
    
    // 如果实际大小与请求大小不符，尝试强制更新
    if (bookmarkWindow.height !== windowHeight || bookmarkWindow.width !== windowWidth) {
      console.log('窗口大小不符合预期，尝试强制更新...');
      setTimeout(async () => {
        try {
          await chrome.windows.update(bookmarkWindow.id, {
            width: windowWidth,
            height: windowHeight
          });
          console.log('已强制更新窗口大小');
        } catch (error) {
          console.error('强制更新窗口大小失败:', error);
        }
      }, 500);
    }

    // 监听窗口关闭事件
    chrome.windows.onRemoved.addListener((windowId) => {
      if (bookmarkWindow && windowId === bookmarkWindow.id) {
        bookmarkWindow = null;
        console.log('书签窗口已关闭');
      }
    });

    // 监听窗口移动/调整大小事件，保存位置
    chrome.windows.onBoundsChanged.addListener(async (window) => {
      if (bookmarkWindow && window.id === bookmarkWindow.id) {
        await saveWindowPosition(window);
      }
    });

  } catch (error) {
    console.error('创建书签窗口失败:', error);
  }
}

// 获取显示器信息（兼容性处理）
async function getDisplayInfo() {
  try {
    if (chrome.system && chrome.system.display) {
      return await chrome.system.display.getInfo();
    } else {
      // 回退方案：使用默认值
      return [{
        isPrimary: true,
        workArea: { width: 1920, height: 1080 }
      }];
    }
  } catch (error) {
    console.log('无法获取显示器信息，使用默认值:', error);
    return [{
      isPrimary: true,
      workArea: { width: 1920, height: 1080 }
    }];
  }
}

// 保存窗口位置和大小
async function saveWindowPosition(window) {
  try {
    // 暂时只保存位置，不保存大小，防止小尺寸被意外保存
    const windowSettings = {
      width: 420,        // 强制保持宽度
      height: 2000,      // 强制保持高度
      left: window.left,
      top: window.top
    };
    
    await chrome.storage.local.set({ windowSettings });
    console.log('已保存窗口位置（强制保持大尺寸）:', windowSettings);
  } catch (error) {
    console.error('保存窗口位置失败:', error);
  }
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'bookmark-this-page') {
    addBookmark(tab);
  }
});

// 添加书签函数
async function addBookmark(tab) {
  try {
    await chrome.bookmarks.create({
      title: tab.title,
      url: tab.url,
      parentId: '1' // 添加到书签栏
    });
    
    // 显示通知
    chrome.notifications.create({
      type: 'basic',
      title: '书签已添加',
      message: `已将 "${tab.title}" 添加到书签`
    });
  } catch (error) {
    console.error('添加书签失败:', error);
  }
}

// 处理书签变更事件
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  console.log('书签已创建:', bookmark);
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('书签已删除:', id);
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  console.log('书签已更新:', id, changeInfo);
});

// 处理存储变更
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('存储已更新:', changes, areaName);
});

// 扩展卸载时清理
chrome.runtime.onSuspend.addListener(() => {
  console.log('书签管理器即将卸载');
});

// 插件图标点击处理（独立窗口模式 - 左侧中部显示） 