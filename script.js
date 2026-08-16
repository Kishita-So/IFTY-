(function() {
  // 1. ログイン関連の要素やオーバーレイを完全に排除
  const oldOverlay = document.getElementById("loginOverlay");
  if (oldOverlay) oldOverlay.remove();
  
  const landingPage = document.getElementById("landingPage");
  if (landingPage) landingPage.style.display = "none";

  // 2. デフォルトユーザーの設定（ログインを完全にバイパス）
  const defaultUser = "default_user";
  localStorage.setItem("currentUser", defaultUser);
  if (!localStorage.getItem("vocab_user_" + defaultUser)) {
    localStorage.setItem("vocab_user_" + defaultUser, JSON.stringify([]));
  }

  // 3. メイン画面・ポータルの表示
  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) {
    mainPortal.style.display = "block";
  }

  // ==========================================
  // 4. メニュー・画面切り替え・機能の完全定義
  // ==========================================

  // メニューを開く関数（ALLIA切替、プレイ、閉じる）
  window.openMenuModal = function() {
    let modal = document.getElementById("appMenuModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "appMenuModal";
      modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000;";
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
      <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
        <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">メニュー</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="${typeof currentView !== 'undefined' && currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">${typeof currentView !== 'undefined' && currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
          <button onclick="openPlaySubMenu()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ プレイ</button>
          <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 4px;">閉じる</button>
        </div>
      </div>
    `;
    modal.style.display = "flex";
  };

  window.closeMenuModal = function() {
    const modal = document.getElementById("appMenuModal");
    if (modal) modal.style.display = "none";
  };

  // プレイモード選択サブメニュー
  window.openPlaySubMenu = function() {
    let modal = document.getElementById("appMenuModal");
    if (!modal) return;

    modal.innerHTML = `
      <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
        <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">🎮 プレイモード選択</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="openFlashcardDirectionMenu()" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">📇 フラッシュカード</button>
          <button onclick="startQuiz()" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">📝 クイズ</button>
          <button onclick="openMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
        </div>
      </div>
    `;
  };

  // フラッシュカード設定（表裏選択）
  window.openFlashcardDirectionMenu = function() {
    let modal = document.getElementById("appMenuModal");
    if (!modal) return;

    modal.innerHTML = `
      <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
        <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">📇 フラッシュカード設定</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="startFlashcards('all', true, 'front')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">表面：単語 / 裏面：意味</button>
          <button onclick="startFlashcards('all', true, 'back')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">表面：意味 / 裏面：単語</button>
          <button onclick="openPlaySubMenu()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
        </div>
      </div>
    `;
  };

  // フラッシュカード開始処理
  window.startFlashcards = function(mode, random = true, direction = 'front') {
    closeMenuModal();
    window.currentFlashcardMode = mode;
    window.isRandomMode = random;
    window.cardMode = direction;
    
    if (typeof loadFlashcardItems === 'function') {
      loadFlashcardItems(mode, random);
    }

    if (typeof flashcardList !== 'undefined' && flashcardList.length === 0) {
      alert("対象となる単語がありません。単語を追加してください。");
      return;
    }

    window.currentFlashcardIndex = 0;
    window.isCardFlipped = false;
    renderFlashcardModal();
  };

  // フラッシュカード描画・終了時の「他のモードでプレイ」対応
  window.renderFlashcardModal = function() {
    let modal = document.getElementById("flashcardModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "flashcardModal";
      modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
      document.body.appendChild(modal);
    } else {
      modal.style.display = "flex";
    }

    if (typeof flashcardList !== 'undefined' && currentFlashcardIndex >= flashcardList.length) {
      modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
          <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 完了！</h3>
          <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべて終了しました。次は別のモードで練習しますか？</p>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ 他のモードでプレイ</button>
            <button onclick="startFlashcards(window.currentFlashcardMode || 'all', window.isRandomMode ?? true, window.cardMode || 'front')" style="padding: 8px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer;">🔄 フラッシュカードを再開</button>
            <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">終了する</button>
          </div>
        </div>
      `;
      return;
    }

    const currentWord = flashcardList[currentFlashcardIndex];
    const meaningsText = Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : (currentWord.meanings || '');
    const frontText = (cardMode === 'front') ? currentWord.word : meaningsText;
    const backText = (cardMode === 'front') ? meaningsText : currentWord.word;

    modal.innerHTML = `
      <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: center; position: relative;">
        <div style="position: absolute; top: 12px; left: 16px; font-size: 0.85em; color: #64748b;">${currentFlashcardIndex + 1} / ${flashcardList.length}</div>
        <button onclick="closeFlashcardModal()" style="position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.2em; cursor: pointer; color: #64748b;">✕</button>
        
        <div onclick="toggleCardFlip()" style="margin: 30px 0 20px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer; min-height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <div style="font-size: 1.5em; font-weight: bold; color: #0f172a; margin-bottom: 8px;">${isCardFlipped ? backText : frontText}</div>
          <div style="font-size: 0.8em; color: #94a3b8; margin-top: 8px;">${isCardFlipped ? '(裏面を表示中)' : '(クリックして裏返す)'}</div>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 12px;">
          <button onclick="setMasteryAndNext('unfixed')" style="flex: 1; padding: 10px; background: #f43f5e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">❌ 未定着</button>
          <button onclick="setMasteryAndNext('fixed')" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">⭕ 定着</button>
        </div>
      </div>
    `;
  };

  window.toggleCardFlip = function() {
    window.isCardFlipped = !window.isCardFlipped;
    renderFlashcardModal();
  };

  window.setMasteryAndNext = function(status) {
    if (typeof flashcardList !== 'undefined' && flashcardList[currentFlashcardIndex]) {
      flashcardList[currentFlashcardIndex].mastery = status;
    }
    window.currentFlashcardIndex++;
    window.isCardFlipped = false;
    renderFlashcardModal();
  };

  window.closeFlashcardModal = function() {
    const modal = document.getElementById("flashcardModal");
    if (modal) modal.style.display = "none";
  };

  // クイズ機能
  window.startQuiz = function() {
    closeMenuModal();
    let modal = document.getElementById("flashcardModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "flashcardModal";
      modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
      document.body.appendChild(modal);
    } else {
      modal.style.display = "flex";
    }

    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">📝 クイズモード</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">クイズ機能は現在準備中です！お楽しみに。</p>
        <button onclick="closeFlashcardModal()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">閉じる</button>
      </div>
    `;
  };

  // 5. アプリ自体の初期化・データ読み込みの安全な実行
  try {
    if (typeof initApp === 'function') {
      initApp();
    } else {
      if (typeof loadUserData === 'function') loadUserData(defaultUser);
      if (typeof renderFolders === 'function') renderFolders();
      if (typeof renderWordList === 'function') renderWordList();
    }
  } catch (e) {
    console.error("App initialization warning:", e);
  }

  console.log("すべての機能（単語帳・フォルダ・ALLIA・プレイ）が復旧しました。");
})();
