(function() {
  // 既存の邪魔なモーダルを全て消去
  const oldOverlay = document.getElementById("loginOverlay");
  if (oldOverlay) oldOverlay.remove();
  const menuModal = document.getElementById("appMenuModal");
  if (menuModal) menuModal.style.display = "none";
  const flashModal = document.getElementById("flashcardModal");
  if (flashModal) flashModal.style.display = "none";

  // 強制的にログイン画面のオーバーレイを作成
  const overlay = document.createElement("div");
  overlay.id = "loginOverlay";
  overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #0f172a; display: flex; justify-content: center; align-items: center; z-index: 999999;";
  
  overlay.innerHTML = `
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
      <h2 style="color: #38bdf8; margin-top: 0; margin-bottom: 8px;">単語帳</h2>
      <p style="color: #94a3b8; font-size: 0.9em; margin-bottom: 16px;">メールアドレスを入力してログイン</p>
      
      <input type="email" id="forceEmailInput" placeholder="例: user@example.com" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; box-sizing: border-box; margin-bottom: 12px; font-size: 1em;" onkeydown="if(event.key==='Enter'){ executeForceLogin(); }">
      
      <button onclick="executeForceLogin()" style="width: 100%; background: #0284c7; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1em;">ログイン / 開始</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // ログイン実行関数
  window.executeForceLogin = function() {
    const emailInput = document.getElementById("forceEmailInput");
    const email = emailInput ? emailInput.value.trim() : "";
    
    if (!email || !email.includes("@")) {
      alert("有効なメールアドレスを入力してください。");
      return;
    }

    // アプリ側のログイン処理（既存関数があれば呼び出す）
    if (typeof loginWithAccount === 'function') {
      loginWithAccount(email);
    } else {
      // 独自に最低限のデータを保存して画面を切り替える
      localStorage.setItem("currentUser", email);
      localStorage.setItem("vocab_user_" + email, JSON.stringify([]));
      overlay.remove();
      location.reload();
    }
  };
})();
