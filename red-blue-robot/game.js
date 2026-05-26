(() => {
  const KEY = "redBlueRobotQuestV1";
  const ROUNDS = {
    1: {
      id: 1,
      title: "第一轮：蓝色机器人看表情",
      shortTitle: "第一轮",
      lockedColor: "blue",
      total: 8,
      ruleText: "蓝色：看表情",
      intro: "这一关只出现蓝色机器人。请只看表情：笑脸按左边，皱眉按右边。",
      next: "round-2.html"
    },
    2: {
      id: 2,
      title: "第二轮：红色机器人看手臂",
      shortTitle: "第二轮",
      lockedColor: "red",
      total: 8,
      ruleText: "红色：看手臂",
      intro: "这一关只出现红色机器人。请只看手臂：举手按左边，垂手按右边。",
      next: "round-3.html"
    },
    3: {
      id: 3,
      title: "第三轮：红蓝混合切换",
      shortTitle: "第三轮",
      lockedColor: null,
      total: 12,
      ruleText: "红蓝混合：按颜色换规则",
      intro: "这一关红蓝会混合出现。蓝色看表情，红色看手臂，颜色一变就要切换规则。",
      next: "result.html"
    }
  };
  const TOTAL_TRIALS = Object.values(ROUNDS).reduce((sum, round) => sum + round.total, 0);
  const TRIAL_LIMIT = 3500;
  const BETWEEN_TRIALS = 560;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let currentTrial = null;
  let startedAt = 0;
  let timeoutId = null;
  let countdownId = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function freshState() {
    return {
      createdAt: Date.now(),
      rounds: {
        1: { completed: false, trials: [] },
        2: { completed: false, trials: [] },
        3: { completed: false, trials: [] }
      }
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      if (parsed && parsed.rounds) return parsed;
    } catch {}
    return freshState();
  }

  function saveState(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function resetAll() {
    const state = freshState();
    saveState(state);
    return state;
  }

  function clearRoundAndAfter(state, roundId) {
    for (let id = roundId; id <= 3; id += 1) {
      state.rounds[id] = { completed: false, trials: [] };
    }
    saveState(state);
  }

  function allTrials(state) {
    return [1, 2, 3].flatMap((id) => state.rounds[id]?.trials || []);
  }

  function metricsForTrials(trials) {
    const answered = trials.length;
    const correct = trials.filter((trial) => trial.correctAnswer).length;
    const switchTrials = trials.filter((trial) => trial.isSwitch);
    const switchCorrect = switchTrials.filter((trial) => trial.correctAnswer).length;
    const rts = trials.filter((trial) => trial.correctAnswer && trial.rt).map((trial) => trial.rt);
    let combo = 0;
    let bestCombo = 0;
    let score = 0;
    for (const trial of trials) {
      if (trial.correctAnswer) {
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        score += 10 + Math.min(combo * 2, 20) + (trial.isSwitch ? 5 : 0);
      } else {
        combo = 0;
      }
    }
    return {
      answered,
      correct,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      avgRt: rts.length ? Math.round(rts.reduce((sum, rt) => sum + rt, 0) / rts.length) : null,
      switchCount: switchTrials.length,
      switchAccuracy: switchTrials.length ? Math.round((switchCorrect / switchTrials.length) * 100) : null,
      combo,
      bestCombo,
      score
    };
  }

  function ratingFor(metrics) {
    let points = metrics.accuracy;
    if (metrics.switchAccuracy !== null) points = Math.round(points * 0.72 + metrics.switchAccuracy * 0.28);
    if (metrics.avgRt && metrics.avgRt < 800) points += 4;
    if (metrics.avgRt && metrics.avgRt > 1600) points -= 4;
    if (points >= 92) return { label: "A+ 探秘高手", detail: "超过本游戏的高阶参考线，规则切换又快又稳。" };
    if (points >= 82) return { label: "A 稳定闯关", detail: "高于本游戏的熟练参考线，已经能稳定使用颜色规则。" };
    if (points >= 68) return { label: "B 继续升级", detail: "接近本游戏的练习参考线，再熟悉规则会更稳。" };
    return { label: "C 热身中", detail: "还在适应规则切换，先放慢速度会更容易做对。" };
  }

  function setText(selector, text) {
    const node = $(selector);
    if (node) node.textContent = text;
  }

  function setHTML(selector, html) {
    const node = $(selector);
    if (node) node.innerHTML = html;
  }

  function roundHeading(round) {
    if (round.id === 1) return '第一轮<br><span class="cyan">看表情</span>';
    if (round.id === 2) return '第二轮<br><span class="pink">看手臂</span>';
    return '第三轮<br><span class="cyan">混合切换</span>';
  }

  function setButtons(enabled) {
    const left = $("#leftBtn");
    const right = $("#rightBtn");
    if (left) left.disabled = !enabled;
    if (right) right.disabled = !enabled;
  }

  function initStars() {
    const canvas = $("#starfield");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let stars = [];
    let meteors = [];
    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(180, Math.max(90, Math.round((width * height) / 11000)));
      stars = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: random(0.45, index % 8 === 0 ? 1.9 : 1.1),
        vx: random(-0.04, 0.08),
        vy: random(0.04, 0.16),
        alpha: random(0.25, 0.86),
        hue: index % 4 === 0 ? "#6fe7ff" : index % 4 === 1 ? "#52f7c8" : index % 4 === 2 ? "#ff8cc8" : "#ffffff"
      }));
      meteors = [];
    }

    function spawnMeteor() {
      meteors.push({
        x: random(width * 0.55, width * 1.05),
        y: random(-height * 0.08, height * 0.38),
        length: random(95, 220),
        speed: random(7, 12),
        life: 1,
        hue: Math.random() > 0.45 ? "#6fe7ff" : "#ff8cc8"
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = star.hue;
        ctx.shadowColor = star.hue;
        ctx.shadowBlur = star.r > 1.2 ? 10 : 0;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
        if (!reduceMotion) {
          star.x += star.vx;
          star.y += star.vy;
          if (star.y > height + 12) {
            star.y = -12;
            star.x = Math.random() * width;
          }
          if (star.x > width + 12) star.x = -12;
        }
      }
      if (!reduceMotion && Math.random() < 0.014 && meteors.length < 3) spawnMeteor();
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const meteor = meteors[i];
        const tailX = meteor.x + meteor.length;
        const tailY = meteor.y - meteor.length * 0.38;
        const gradient = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(255,255,255,${meteor.life})`);
        gradient.addColorStop(0.2, meteor.hue === "#6fe7ff" ? `rgba(111,231,255,${meteor.life * 0.8})` : `rgba(255,140,200,${meteor.life * 0.8})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.strokeStyle = gradient;
        ctx.shadowColor = meteor.hue;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.restore();
        if (!reduceMotion) {
          meteor.x -= meteor.speed;
          meteor.y += meteor.speed * 0.38;
          meteor.life -= 0.018;
        }
        if (meteor.life <= 0 || meteor.x < -meteor.length) meteors.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (!reduceMotion) requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
  }

  function makeTrial(round, previousRule) {
    let color = round.lockedColor;
    if (!color) {
      if (!previousRule) {
        color = Math.random() > 0.5 ? "blue" : "red";
      } else {
        const shouldSwitch = Math.random() < 0.62;
        color = shouldSwitch ? (previousRule === "blue" ? "red" : "blue") : previousRule;
      }
    }
    const expression = Math.random() > 0.5 ? "smile" : "frown";
    const arms = Math.random() > 0.5 ? "up" : "down";
    const correct = color === "blue"
      ? (expression === "smile" ? "left" : "right")
      : (arms === "up" ? "left" : "right");
    return {
      color,
      expression,
      arms,
      correct,
      isSwitch: !round.lockedColor && previousRule && previousRule !== color,
      round: round.id
    };
  }

  function updateRobot(trial) {
    const wrap = $("#robotWrap");
    const robot = $("#robot");
    const mouth = $("#mouth");
    if (!wrap || !robot || !mouth) return;
    robot.className = `robot ${trial.color} arms-${trial.arms}`;
    mouth.className = `mouth ${trial.expression}`;
    wrap.classList.remove("pop", "correct", "wrong");
    void wrap.offsetWidth;
    wrap.classList.add("pop");
    wrap.style.color = trial.color === "blue" ? "var(--blue)" : "var(--red)";
  }

  function updateLiveStats(state, round) {
    const roundTrials = state.rounds[round.id].trials;
    const totalMetrics = metricsForTrials(allTrials(state));
    const roundMetrics = metricsForTrials(roundTrials);
    setText("#roundProgress", `${roundTrials.length}/${round.total}`);
    setText("#totalProgress", `${allTrials(state).length}/${TOTAL_TRIALS}`);
    setText("#scoreNow", String(totalMetrics.score));
    setText("#comboNow", String(totalMetrics.combo));
    setText("#accNow", roundMetrics.answered ? `${roundMetrics.accuracy}%` : "--");
    setText("#timeNow", roundMetrics.avgRt ? `${roundMetrics.avgRt}ms` : "--");
    setText("#accResult", roundMetrics.answered ? `${roundMetrics.accuracy}%` : "--");
    setText("#rtResult", roundMetrics.avgRt ? `${roundMetrics.avgRt}ms` : "--");
    setText("#bestComboResult", totalMetrics.bestCombo ? String(totalMetrics.bestCombo) : "--");
    setText("#switchResult", round.id === 3
      ? (roundMetrics.switchCount ? `${roundMetrics.switchAccuracy}%` : "等待切换")
      : "第3关统计");
  }

  function completeRound(state, round) {
    state.rounds[round.id].completed = true;
    saveState(state);
    const roundMetrics = metricsForTrials(state.rounds[round.id].trials);
    const layer = $("#phaseLayer");
    setButtons(false);
    if (layer) layer.classList.remove("hidden");
    setText("#phaseTitle", `${round.shortTitle}完成`);
    setText("#phaseText", `本轮正确率 ${roundMetrics.accuracy}%，平均反应时 ${roundMetrics.avgRt ? `${roundMetrics.avgRt}ms` : "--"}。准备进入下一关。`);
    const nextBtn = $("#nextBtn");
    if (nextBtn) {
      nextBtn.textContent = round.id === 3 ? "查看总成绩" : `进入${ROUNDS[round.id + 1].shortTitle}`;
      nextBtn.href = round.next;
      nextBtn.style.display = "inline-flex";
    }
    setText("#feedback", "闯关完成");
    $("#feedback")?.classList.add("ok");
  }

  function initRound(roundId) {
    initStars();
    const round = ROUNDS[roundId];
    let state = loadState();
    clearRoundAndAfter(state, roundId);
    state = loadState();
    let previousRule = null;
    let running = false;

    setHTML("#roundTitle", roundHeading(round));
    setText("#roundIntro", round.intro);
    setText("#ruleText", round.ruleText);
    setText("#phaseTitle", round.title);
    setText("#phaseText", round.intro);
    updateLiveStats(state, round);

    function showTrial() {
      const roundTrials = state.rounds[round.id].trials;
      if (!running || roundTrials.length >= round.total) {
        completeRound(state, round);
        return;
      }
      currentTrial = makeTrial(round, previousRule);
      previousRule = currentTrial.color;
      startedAt = performance.now();
      updateRobot(currentTrial);
      setButtons(true);
      setText("#feedback", currentTrial.isSwitch ? "规则变了，快速切换" : "请快速判断");
      $("#feedback")?.classList.remove("ok", "no");
      setText("#ruleText", round.id === 3
        ? (currentTrial.color === "blue" ? "蓝色：看表情" : "红色：看手臂")
        : round.ruleText);
      let remaining = TRIAL_LIMIT;
      setText("#countText", `${(remaining / 1000).toFixed(1)}s`);
      clearInterval(countdownId);
      countdownId = window.setInterval(() => {
        remaining -= 100;
        setText("#countText", `${Math.max(0, remaining / 1000).toFixed(1)}s`);
      }, 100);
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => handleAnswer("timeout"), TRIAL_LIMIT);
    }

    function handleAnswer(answer) {
      if (!running || !currentTrial) return;
      clearTimeout(timeoutId);
      clearInterval(countdownId);
      setButtons(false);
      const rt = answer === "timeout" ? null : Math.round(performance.now() - startedAt);
      const correctAnswer = answer === currentTrial.correct;
      state.rounds[round.id].trials.push({
        ...currentTrial,
        answer,
        correctAnswer,
        rt,
        time: Date.now()
      });
      saveState(state);
      const wrap = $("#robotWrap");
      const feedback = $("#feedback");
      if (correctAnswer) {
        if (feedback) {
          feedback.textContent = currentTrial.isSwitch ? "切换成功！" : "命中！";
          feedback.className = "feedback ok";
        }
        wrap?.classList.add("correct");
      } else {
        if (feedback) {
          feedback.textContent = answer === "timeout" ? "时间到，下一题继续" : "被干扰了，下一题再来";
          feedback.className = "feedback no";
        }
        wrap?.classList.add("wrong");
      }
      currentTrial = null;
      updateLiveStats(state, round);
      window.setTimeout(showTrial, BETWEEN_TRIALS);
    }

    $("#startRoundBtn")?.addEventListener("click", () => {
      running = true;
      $("#phaseLayer")?.classList.add("hidden");
      $("#nextBtn")?.style.setProperty("display", "none");
      showTrial();
    });
    $("#resetRoundBtn")?.addEventListener("click", () => {
      running = false;
      clearTimeout(timeoutId);
      clearInterval(countdownId);
      state = loadState();
      clearRoundAndAfter(state, roundId);
      state = loadState();
      previousRule = null;
      currentTrial = null;
      setButtons(false);
      $("#phaseLayer")?.classList.remove("hidden");
      setText("#phaseTitle", round.title);
      setText("#phaseText", round.intro);
      setText("#ruleText", round.ruleText);
      setText("#countText", "--");
      setText("#feedback", "准备接收任务信号");
      $("#feedback")?.classList.remove("ok", "no");
      updateLiveStats(state, round);
    });
    $("#leftBtn")?.addEventListener("click", () => handleAnswer("left"));
    $("#rightBtn")?.addEventListener("click", () => handleAnswer("right"));
    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") handleAnswer("left");
      if (event.key === "l" || event.key === "L" || event.key === "ArrowRight") handleAnswer("right");
    });
  }

  function initHome() {
    initStars();
    $("#startQuestBtn")?.addEventListener("click", () => {
      resetAll();
      location.href = "round-1.html";
    });
  }

  function initResult() {
    initStars();
    const state = loadState();
    const trials = allTrials(state);
    if (!trials.length) {
      setText("#finalAcc", "--");
      setText("#finalRt", "--");
      setText("#finalSwitch", "--");
      setText("#finalScore", "--");
      setText("#finalCombo", "--");
      setText("#finalRating", "等待闯关");
      setText("#finalTip", "还没有完成闯关。请从第一轮开始，依次完成三关后再查看总成绩。");
      $("#restartQuestBtn")?.addEventListener("click", () => {
        resetAll();
        location.href = "round-1.html";
      });
      return;
    }
    const metrics = metricsForTrials(trials);
    const rating = ratingFor(metrics);
    setText("#finalAcc", `${metrics.accuracy}%`);
    setText("#finalRt", metrics.avgRt ? `${metrics.avgRt}ms` : "--");
    setText("#finalSwitch", metrics.switchAccuracy !== null ? `${metrics.switchAccuracy}%` : "--");
    setText("#finalScore", String(metrics.score));
    setText("#finalCombo", String(metrics.bestCombo));
    setText("#finalRating", rating.label);
    setText("#finalTip", `最终准确率 ${metrics.accuracy}%。${rating.detail} 这些结果只是本游戏里的科普反馈，不代表真实能力测评。`);
    for (const id of [1, 2, 3]) {
      const roundMetrics = metricsForTrials(state.rounds[id]?.trials || []);
      setText(`#round${id}Acc`, roundMetrics.answered ? `${roundMetrics.accuracy}%` : "--");
      setText(`#round${id}Rt`, roundMetrics.avgRt ? `${roundMetrics.avgRt}ms` : "--");
    }
    $("#restartQuestBtn")?.addEventListener("click", () => {
      resetAll();
      location.href = "round-1.html";
    });
  }

  window.RobotQuest = {
    initHome,
    initRound,
    initResult,
    resetAll
  };
})();
