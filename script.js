(function() {
  // 1. ログイン関連のオーバーレイや要素を完全に削除
  const oldOverlay = document.getElementById("loginOverlay");
  if (oldOverlay) oldOverlay.remove();

  const landingPage = document.getElementById("landingPage");
  if (landingPage) landingPage.style.display = "none";

  // 2. 常にゲストまたはデフォルトユーザーとしてデータを固定
  const defaultUser = "default_user";
  localStorage.setItem("currentUser", defaultUser);
  if (!localStorage.getItem("vocab_user_" + defaultUser)) {
    localStorage.setItem("vocab_user_" + defaultUser, JSON.stringify([]));
  }

  // 3. メイン画面（ポータルなど）を表示状態にする
  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) {
    mainPortal.style.display = "block";
  }

  // 4. ヘッダーなどの「ログイン中」「ログアウト」表示が不要であれば非表示にする
  // （もしログアウトボタンを残したい場合はそのままにします）

  // 5. アプリの初期化関数があれば呼び出して全機能をアクティブにする
  if (typeof initApp === 'function') {
    initApp();
  } else if (typeof loadUserData === 'function') {
    loadUserData(defaultUser);
  } else {
    // 画面の構造を再読み込みせずに復旧するため、もしDOM描画関数があれば実行
    if (typeof renderFolders === 'function') renderFolders();
    if (typeof renderWordList === 'function') renderWordList();
  }

  console.log("ログイン機能を完全に廃止し、すべての機能を復旧しました。");
})();
