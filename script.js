(function() {
  // 1. ログイン状態を強制的に保存してバイパス
  const guestUser = "guest@example.com";
  localStorage.setItem("currentUser", guestUser);
  
  // もしユーザーごとのデータがなければ初期化
  if (!localStorage.getItem("vocab_user_" + guestUser)) {
    localStorage.setItem("vocab_user_" + guestUser, JSON.stringify([]));
  }

  // 2. 画面上のログインオーバーレイやモーダルを強制削除・非表示にする
  const oldOverlay = document.getElementById("loginOverlay");
  if (oldOverlay) oldOverlay.remove();
  
  const landingPage = document.getElementById("landingPage");
  if (landingPage) landingPage.style.display = "none";
  
  const menuModal = document.getElementById("appMenuModal");
  if (menuModal) menuModal.style.display = "none";
  
  const flashModal = document.getElementById("flashcardModal");
  if (flashModal) flashModal.style.display = "none";

  // 3. メイン画面（ポータルなど）を表示状態にする
  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) {
    mainPortal.style.display = "block";
  }

  // 4. アプリ側の初期化関数があれば実行して画面を再描画
  if (typeof initApp === 'function') {
    initApp();
  } else if (typeof loadUserData === 'function') {
    loadUserData(guestUser);
  } else {
    location.reload(); // 必要に応じて再読み込み
  }
  
  console.log("ログイン機能をバイパスしました。");
})();
