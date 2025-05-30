// 后台服务工作器
chrome.runtime.onInstalled.addListener(() => {
  console.log('极简书签管理器已安装');
  
  // 设置右键菜单
  chrome.contextMenus.create({
    id: 'bookmark-this-page',
    title: '添加到书签',
    contexts: ['page']
  });
});

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