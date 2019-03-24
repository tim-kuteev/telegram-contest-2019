(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STYLE_MODE_KEY = 'STYLE_MODE';
  const INITIAL_WIDTH = 28;
  const HEIGHT_SHIFT = 1.05;
  const CHART_HEIGHT = 400;
  const Y_AXIS_SHIFT = 0.19;
  const X_AXIS_VAL_WIDTH_RATE = 120;
  const CONTROLS_WIDTH = 12;
  const appContainer = document.querySelector('#app_container');
  const chartTemplate = document.querySelector('#chart_template');
  const nightSwitchBtn = document.querySelector('#night_switch');

  function powerOf2(n) {
    while ((n & (n - 1)) !== 0) {
      n--;
    }
    return n;
  }

  function dateFormat(time, ...pattern) {
    const chunks = new Date(time).toDateString().split(' ');
    return pattern.map(p => p.length ? chunks[p[0]] + p[1] : chunks[p]).join(' ');
  }

  function fadeAnimation(el) {
    el.addEventListener('animationstart', (e) => {
      if (e.animationName === 'fade-in') {
        e.target.classList.add('fade-animation');
      }
    });
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'fade-out') {
        e.target.classList.remove('fade-animation');
      }
    });
  }


  function styleMode(mode) {
    if (mode === 'night') {
      nightSwitchBtn.innerHTML = 'Switch to Day Mode';
      document.body.classList.add('night-mode');
    } else {
      nightSwitchBtn.innerHTML = 'Switch to Night Mode';
      document.body.classList.remove('night-mode');
    }
  }
  styleMode(localStorage.getItem(STYLE_MODE_KEY));

  nightSwitchBtn.addEventListener('click', (e) => {
    const mode = localStorage.getItem(STYLE_MODE_KEY) === 'night' ? 'day' : 'night';
    localStorage.setItem(STYLE_MODE_KEY, mode);
    styleMode(mode);
  });


  fetch('chart_data.json', {method: 'GET'})
    .then(res => res.json())
    .then(res => {
      return res.map(el => {
        const xName = Object.keys(el.types).find(key => el.types[key] === 'x');
        return {
          x: el.columns.find(c => c[0] === xName).slice(1),
          lines: el.columns.filter(c => c[0] !== xName).map(c => {
            return {
              name: el.names[c[0]],
              color: el.colors[c[0]],
              data: c.slice(1),
            };
          }),
        };
      });
    })
    .then(res => res.forEach(data => new Chart(data)));


  class Chart {
    constructor(data) {
      this.template = document.importNode(chartTemplate.content, true);
      this.svgContainer = new SVGContainer(this.template.querySelector('svg.chart-container'), data);
      this.footer = new Footer(this.template.querySelector('div.footer'), this.svgContainer, data);
      appContainer.appendChild(this.template);
      this.initView();
      this.initScroll();
    }

    initView() {
      let bBox = this.svgContainer.svgChart.element.getBBox();
      this.svgContainer.initView(bBox);
      this.footer.svgScroll.setAttribute('viewBox', `${bBox.x} ${bBox.y} ${bBox.width} ${bBox.height}`);
    }

    initScroll() {
      const viewBox = this.svgContainer.svgChart.element.viewBox.baseVal;
      const dataWidth = this.svgContainer.data.x.length - 1;
      const left = viewBox.x / dataWidth;
      const right = 1 - (viewBox.x + viewBox.width) / dataWidth;
      this.footer.scroll.setBasis(left, right);
      this.footer.scroll.register((left, right) => this.scrollChart(left, right));
    }

    scrollChart(left, right) {
      this.svgContainer.svgChart.scroll(left, right);
      this.svgContainer.scaleHorizontal();
      this.svgContainer.scaleVertical(30);
    }
  }


  class SVGContainer {
    constructor(element, data) {
      this.element = element;
      this.data = data;
      this.svgChart = new SVGChart(this.element.querySelector('svg.chart'), this.data);
      this.svgXAxis = new SVGXAxis(this.element.querySelector('g.x-axis'), this.data.x);
      this.svgYAxis = new SVGYAxis(this.element.querySelector('g.y-axis'));
      this.infoBox = new InfoBox(this.element.querySelector('foreignObject div.info-box'), this.data);
      this.element.addEventListener('click', e => this.showInfo(e));
    }

    initView(bBox) {
      const width = bBox.width < INITIAL_WIDTH ? bBox.width : INITIAL_WIDTH;
      this.svgChart.element.setAttribute('viewBox', `${bBox.width - width} ${bBox.y} ${width} ${-bBox.y}`);
      this.observeResize();
    }

    observeResize() {
      this.scaleVertical();
      if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(entries => {
          window.requestAnimationFrame(() => {
            this.rectWidth = this.element.getBoundingClientRect().width;
            window.requestAnimationFrame(() => {
              entries.forEach(entry => this.scaleHorizontal());
            });
          });
        });
        observer.observe(appContainer);
      } else {
        console.warn('ResizeObserver is not supported in this browser.');
        this.rectWidth = this.element.getBoundingClientRect().width;
        this.scaleHorizontal();
        window.addEventListener('resize', () => {
          this.rectWidth = this.element.getBoundingClientRect().width;
          window.requestAnimationFrame(() => {
            this.scaleHorizontal();
          });
        });
      }
    }

    showInfo(e) {
      const point = this.point(e);
      this.svgChart.addInfo(point);
      this.infoBox.show(point);
    }

    hideInfo() {
      this.svgChart.clearInfo();
      this.infoBox.hide();
    }

    point(e) {
      e = e || window.event;
      const inverseCTM = this.svgChart.element.getScreenCTM().inverse();
      let pt = this.svgChart.element.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      pt = pt.matrixTransform(inverseCTM);

      const parentSvgCTM = this.element.getScreenCTM();
      const matrix = inverseCTM.multiply(parentSvgCTM);
      matrix.e = 0;

      return {x: Math.round(pt.x), matrix: matrix};
    }

    scaleHorizontal() {
      this.hideInfo();

      const scaleWidth = this.rectWidth / this.svgChart.element.viewBox.baseVal.width;
      let frequency = powerOf2(~~(X_AXIS_VAL_WIDTH_RATE / scaleWidth));
      let xShift = this.svgChart.element.viewBox.baseVal.x;
      this.svgXAxis.xAxisGroups.forEach(g => {
        g.element.setAttribute('transform', `translate(${scaleWidth * (g.x - xShift)}, 0)`);
        if (!(g.x % frequency)) {
          g.element.classList.remove('hidden');
        } else {
          g.element.classList.add('hidden');
        }
      });
    }

    scaleVertical(frames) {
      this.hideInfo();

      const xShift = ~~this.svgChart.element.viewBox.baseVal.x;
      let boxWidth = ~~this.svgChart.element.viewBox.baseVal.width;
      let yMax = 0;
      this.data.lines.forEach(line => {
        if (line.hidden) {
          return;
        }
        for (let xi = xShift; xi <= xShift + boxWidth + 2; xi++) {
          const yy = line.data[xi];
          yy > yMax && (yMax = yy);
        }
      });
      if (yMax === 0) {
        return;
      }
      yMax *= HEIGHT_SHIFT;
      if (this.scaleHeight !== yMax) {
        this.scaleHeight = yMax;
        this.scaleStep = -(this.svgChart.element.viewBox.baseVal.height - this.scaleHeight) / (frames || 1) || 1;
        this.svgYAxis.newSet(this.scaleHeight);
        this.animateVerticalScale();
      }
    }

    animateVerticalScale() {
      this.hideInfo();

      let proceed = false;
      if (~~this.scaleHeight !== ~~this.svgChart.element.viewBox.baseVal.height) {
        let heightStep = this.scaleHeight - this.svgChart.element.viewBox.baseVal.height;
        (Math.abs(heightStep) > Math.abs(this.scaleStep)) && (heightStep = this.scaleStep);
        this.svgChart.element.viewBox.baseVal.height += heightStep;
        this.svgChart.element.viewBox.baseVal.y -= heightStep;
        proceed = true;
      }

      if (proceed) {
        const boxHeight = this.svgChart.element.viewBox.baseVal.height;
        this.svgYAxis.element.querySelectorAll('g.flexible').forEach(g => {
          const value = g.getAttribute('value');
          g.setAttribute('transform', `translate(0, -${value * CHART_HEIGHT / boxHeight})`);
        });

        window.requestAnimationFrame(() => this.animateVerticalScale());
      }
    }
  }


  class SVGChart {
    constructor(element, data) {
      this.element = element;
      this.data = data;
      this.init();
    }

    init() {
      this.data.lines.forEach(line => {
        const d = 'M ' + line.data.map((val, i) => i + ' ' + val).join(' L ');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('stroke', line.color);
        path.setAttribute('d', d);
        line.element = path;
        fadeAnimation(path);
        this.element.appendChild(path);
      });
    }

    scroll(left, right) {
      if (left) {
        this.element.viewBox.baseVal.x = left * (this.data.x.length - 1);
      }
      if (right) {
        this.element.viewBox.baseVal.width = right * (this.data.x.length - 1) - this.element.viewBox.baseVal.x;
      }
    }

    addInfo(point) {
      if (!this.info) {
        const bBox = this.element.getBBox();

        this.info = document.createElementNS(SVG_NS, 'g');
        this.info.classList.add('info-mark');

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('y2', '' + (bBox.y * HEIGHT_SHIFT));
        this.info.appendChild(line);

        this.data.lines.forEach(y => {
          const transform = this.element.createSVGTransform();
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('stroke', y.color);
          circle.storedY = y;
          circle.storedTransform = transform;
          circle.transform.baseVal.appendItem(transform);
          this.info.appendChild(circle);
        });

        this.element.appendChild(this.info);
      }

      this.info.querySelectorAll('circle').forEach(circle => {
        if (circle.storedY.hidden) {
          circle.style.setProperty('display', 'none');
        } else {
          circle.style.setProperty('display', 'block');
          point.matrix.f = -circle.storedY.data[point.x];
          circle.storedTransform.setMatrix(point.matrix);
        }
      });
      this.info.setAttribute('transform', `translate(${point.x}, 0)`);
      this.info.removeAttribute('display');
    }

    clearInfo() {
      this.info && this.info.setAttribute('display', 'none');
    }
  }


  class SVGXAxis {
    constructor(element, x) {
      this.element = element;
      this.xAxisGroups = [];
      this.init(x);
    }

    init(x) {
      for (let i = 1; i < x.length - 1; i++) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.textContent = dateFormat(x[i], 1, 2);
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('hidden');
        group.appendChild(text);
        this.xAxisGroups.push({x: i, element: group});
        fadeAnimation(group);
        this.element.appendChild(group);
      }
    }
  }


  class SVGYAxis {
    constructor(element) {
      this.element = element;
      this.yAxisGroups = [];
      this.element.appendChild(this.createRow('0'));
    }

    newSet(height) {
      this.element.querySelectorAll('g.flexible').forEach(g => {
        g.classList.add('hidden');
        g.addEventListener('animationend', (e) => {
          e.target.parentNode && e.target.parentNode.removeChild(e.target);
        });
      });
      const step = ~~(height * Y_AXIS_SHIFT);
      for (let val = step; val < height; val += step) {
        const group = this.createRow(val);
        group.classList.add('flexible');
        this.yAxisGroups.push(group);
        this.element.appendChild(group);
      }
    }

    createRow(val) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x2', '100%');

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('y', '-5');
      text.innerHTML = val;

      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('value', val);
      group.appendChild(line);
      group.appendChild(text);
      return group;
    }
  }

  class InfoBox {
    constructor(element, data) {
      this.element = element;
      this.data = data;
      this.values = [];
      this.caption = this.element.querySelector('div.caption');
      this.legend = this.element.querySelector('div.legend');
    }

    show(point) {
      this.caption.innerHTML = dateFormat(this.data.x[point.x], [0, ','], 1, 2);
      if (!this.values.length) {
        this.data.lines.forEach(y => {
          const value = document.createElement('div');
          value.classList.add('value');
          value.storedY = y;
          this.values.push(value);
          const name = document.createElement('div');
          name.classList.add('name');
          name.innerHTML = y.name;
          const el = document.createElement('div');
          el.style.setProperty('color', y.color);
          el.storedValue = value;
          el.appendChild(value);
          el.appendChild(name);
          this.legend.appendChild(el);
        });
      }
      this.values.forEach(el => {
        el.innerHTML = el.storedY.data[point.x];
      });
      this.element.style.setProperty('display', 'block');
    }

    hide() {
      this.element.style.setProperty('display', 'none');
    }
  }


  class Footer {
    constructor(element, svgContainer, data) {
      this.element = element;
      this.svgContainer = svgContainer;
      this.data = data;
      this.svgScroll = this.element.querySelector('svg.scroll').appendChild(this.svgContainer.svgChart.element.cloneNode(true));
      this.svgScroll.setAttribute('height', '50px');
      this.scroll = new ScrollManager(this.element.querySelector('div.controls'));
      this.buttons = this.element.querySelector('div.buttons');
      this.initButtons();
    }

    initButtons() {
      this.data.lines.forEach(line => {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        const tick = document.createElement('div');
        tick.style.setProperty('--tick-color', line.color);
        tick.innerHTML = '&#10004';
        button.appendChild(tick);
        const name = document.createElement('div');
        name.innerHTML = line.name;
        button.appendChild(name);
        this.buttons.appendChild(button);

        button.addEventListener('click', () => {
          tick.classList.toggle('unchecked');
          line.element.classList.toggle('hidden', line.hidden = !line.hidden);
          this.svgContainer.scaleVertical(15);
        });
      });
    }
  }

  class ScrollManager {
    constructor(el) {
      this.element = el;
      this.leftShade = this.element.querySelector('div.left-shade');
      this.rightShade = this.element.querySelector('div.right-shade');
      this.leftControl = this.element.querySelector('div.left-control');
      this.rightControl = this.element.querySelector('div.right-control');
      this.wndControl = this.element.querySelector('div.window');
    }

    setBasis(left, right) {
      const controlsWidth = 1 - CONTROLS_WIDTH / this.element.clientWidth;
      if (left > controlsWidth) {
        left = controlsWidth;
      }
      this.leftShade.style.setProperty('flex-basis', 100 * left + '%');
      this.rightShade.style.setProperty('flex-basis', 100 * right + '%');
    }

    register(callback) {
      this.callback = callback;

      new DragManager(this.leftControl).watch((type, clientX) => {
        if (type === 'start') {
          this.onDragStart(clientX);
        } else {
          this.onDrag(clientX, false);
        }
      });

      new DragManager(this.rightControl).watch((type, clientX) => {
        if (type === 'start') {
          this.onDragStart(clientX);
        } else {
          this.onDrag(clientX, true);
        }
      });

      new DragManager(this.wndControl).watch((type, clientX) => {
        if (type === 'start') {
          this.onDragStart(clientX);
        } else {
          this.onDragWnd(clientX);
        }
      });

      return this;
    }

    onDragStart(clientX) {
      this.clientXStart = clientX;
      this.basisLeftStart = parseFloat(this.leftShade.style['flex-basis']) / 100;
      this.basisRightStart = parseFloat(this.rightShade.style['flex-basis']) / 100;
      this.controlsWidth = 1 - CONTROLS_WIDTH / this.element.clientWidth;
    }

    onDrag(clientX, right) {
      let shift = (clientX - this.clientXStart) / this.element.clientWidth;
      right && (shift *= -1);
      if (this.basisLeftStart + this.basisRightStart + shift > this.controlsWidth) {
        shift = this.controlsWidth - this.basisRightStart - this.basisLeftStart;
      }
      right ? this.setShift(null, shift) : this.setShift(shift, null);
    }

    onDragWnd(clientX) {
      let shift = (clientX - this.clientXStart) / this.element.clientWidth;
      this.setShift(shift, -shift);
    }

    setShift(left, right) {
      if (!left && !right) {
        return;
      }
      if (left && this.basisLeftStart + left <= 0) {
        left = -this.basisLeftStart;
        right && (right = -left);
      } else if (right && this.basisRightStart + right <= 0) {
        right = -this.basisRightStart;
        left && (left = -right);
      }
      if (left) {
        this.leftMove = this.basisLeftStart + left;
        this.leftShade.style.setProperty('flex-basis', 100 * this.leftMove + '%');
      } else if (!this.leftMove) {
        this.leftMove = parseFloat(this.leftShade.style['flex-basis']) / 100;
      }
      if (right) {
        this.rightMove = this.basisRightStart + right;
        this.rightShade.style.setProperty('flex-basis', 100 * this.rightMove + '%');
        this.rightMove = 1 - this.rightMove;
      } else if (!this.rightMove) {
        this.rightMove = 1 - parseFloat(this.rightShade.style['flex-basis']) / 100;
      }
      this.move();
    }

    move() {
      this.callback(this.leftMove, this.rightMove);
    }
  }

  class DragManager {
    constructor(el) {
      this.element = el;
    }

    watch(callback) {
      this.callback = callback;
      const listener = this.dragStart.bind(this);
      this.element.addEventListener('mousedown', listener);
      this.element.addEventListener('touchstart', listener);
    }

    dragStart(e) {
      e = e || window.event;
      const touch = this.event('start', e);
      e.preventDefault();
      this.moveListener = this.dragProgress.bind(this);
      this.moveEndListener = this.dragClose.bind(this);
      document.addEventListener(touch ? 'touchmove' : 'mousemove', this.moveListener);
      document.addEventListener(touch ? 'touchend' : 'mouseup', this.moveEndListener);
      document.addEventListener('click', this.moveEndListener);
    }

    dragProgress(e) {
      e = e || window.event;
      this.event('progress', e);
    }

    dragClose(e) {
      e = e || window.event;
      e.preventDefault();
      const touch = this.event('close', e);
      document.removeEventListener(touch ? 'touchmove' : 'mousemove', this.moveListener);
      document.removeEventListener(touch ? 'touchend' : 'mouseup', this.moveEndListener);
      document.removeEventListener('click', this.moveEndListener);
    }

    event(type, e) {
      const touch = e.type.startsWith('touch');
      const clientX = touch ? e.changedTouches[0].clientX : e.clientX;
      const clientY = touch ? e.changedTouches[0].clientY : e.clientY;
      this.callback(type, clientX, clientY);
      return touch;
    }
  }

})();
