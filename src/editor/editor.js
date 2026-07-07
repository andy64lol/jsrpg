// editor de mapas -- solo funciona en servidor local

const TILE_PX = 24;
const MAPAS = ['map1', 'map2', 'map3'];

// colores pa tipos de colision
const TIPO_COLOR = {
    air:           '#1a1a1a',
    solid:         '#3a3a3a',
    player_spawn:  '#0d4a1e',
    door:          '#0d1e5c',
    heal:          '#0d4a4a',
    entity_spawn:  '#5c0d0d',
    player_damage: '#6b3500',
    chest:         '#4a4a0d',
};

function tipoAColor(tipo) {
    return TIPO_COLOR[tipo] ?? '#222';
}

function parseCSV(text) {
    return text.trim().split('\n')
        .map(r => r.trim()).filter(Boolean)
        .map(r => r.split(',').map(Number));
}

function csvAString(grid) {
    return grid.map(r => r.join(',')).join('\n');
}

// limpia jsonc pa parsearlo
function parsearJSONC(text) {
    return JSON.parse(
        text
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n\r]*/g, '')
            .replace(/,(\s*[\]}])/g, '$1')
    );
}

export class Editor {
    constructor() {
        this.mapaActual  = 'map1';
        this.capa        = 'visual'; // 'visual' | 'colision'
        this.datos       = null;
        this.selId       = 0;
        this.herramienta = 'pintar'; // 'pintar' | 'rellenar'
        this.pintando    = false;
        this.imgCache    = {};

        this.overlay     = null;
        this.canvas      = null;
        this.ctx         = null;
        this.selMapa     = null;
        this.btnGuardar  = null;
        this.btnPintar   = null;
        this.btnRellenar = null;
        this.btnVisual   = null;
        this.btnColision = null;
        this.panelPaleta = null;
        this.lblEstado   = null;
    }

    abrir() {
        if (!this.overlay) this._construirUI();
        this.overlay.style.display = 'flex';
        // pausa el juego mientras el editor esta abierto
        if (window.__game) window.__game.setInventoryOpen(true);
        if (!this.datos) this.cargarMapa(this.mapaActual);
    }

    cerrar() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (window.__game) window.__game.setInventoryOpen(false);
    }

    estaAbierto() {
        return !!this.overlay && this.overlay.style.display !== 'none';
    }

    _construirUI() {
        this.overlay = document.createElement('div');
        Object.assign(this.overlay.style, {
            position: 'fixed', inset: '0', zIndex: '200',
            display: 'flex', flexDirection: 'column',
            background: '#000', color: '#fff',
            fontFamily: '"PixeloidMono", monospace, sans-serif',
            fontSize: '11px',
        });

        // barra de arriba
        const barra = document.createElement('div');
        Object.assign(barra.style, {
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.15)',
            flexShrink: '0', flexWrap: 'wrap',
        });

        barra.appendChild(this._span('EDITOR', 'font-size:13px;letter-spacing:.12em;opacity:.4;margin-right:6px;'));

        // selector de mapa
        this.selMapa = document.createElement('select');
        MAPAS.forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            this.selMapa.appendChild(o);
        });
        this._estilarSelect(this.selMapa);
        this.selMapa.addEventListener('change', () => this.cargarMapa(this.selMapa.value));
        barra.appendChild(this.selMapa);

        // capas
        this.btnVisual   = this._crearBtn('Visual',   () => this._setCapa('visual'));
        this.btnColision = this._crearBtn('Colisión', () => this._setCapa('colision'));
        barra.appendChild(this.btnVisual);
        barra.appendChild(this.btnColision);

        // separador flexible
        const sep = document.createElement('div');
        sep.style.flex = '1';
        barra.appendChild(sep);

        // herramientas
        this.btnPintar   = this._crearBtn('✏ Pintar',   () => this._setHerramienta('pintar'));
        this.btnRellenar = this._crearBtn('⬛ Rellenar', () => this._setHerramienta('rellenar'));
        barra.appendChild(this.btnPintar);
        barra.appendChild(this.btnRellenar);

        // label de estado (sin guardar etc)
        this.lblEstado = this._span('', 'margin-left:8px;opacity:.45;font-size:9px;min-width:80px;');
        barra.appendChild(this.lblEstado);

        // boton guardar
        this.btnGuardar = this._crearBtn('💾 Guardar', () => this.guardar());
        this.btnGuardar.style.marginLeft = '4px';
        barra.appendChild(this.btnGuardar);

        // cerrar
        barra.appendChild(this._crearBtn('✕', () => this.cerrar()));
        this.overlay.appendChild(barra);

        // cuerpo: paleta izquierda + canvas derecha
        const cuerpo = document.createElement('div');
        Object.assign(cuerpo.style, {
            display: 'flex', flex: '1', minHeight: '0', overflow: 'hidden',
        });

        this.panelPaleta = document.createElement('div');
        Object.assign(this.panelPaleta.style, {
            width: '150px', minWidth: '150px',
            borderRight: '1px solid rgba(255,255,255,0.12)',
            overflowY: 'auto', padding: '8px',
            display: 'flex', flexDirection: 'column', gap: '3px',
        });
        cuerpo.appendChild(this.panelPaleta);

        const areaCanvas = document.createElement('div');
        Object.assign(areaCanvas.style, {
            flex: '1', overflow: 'auto', padding: '12px', background: '#050505',
        });
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        Object.assign(this.canvas.style, {
            display: 'block', imageRendering: 'pixelated', cursor: 'crosshair',
        });
        areaCanvas.appendChild(this.canvas);
        cuerpo.appendChild(areaCanvas);

        this.overlay.appendChild(cuerpo);
        document.body.appendChild(this.overlay);

        // eventos del canvas
        this.canvas.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            this.pintando = true;
            this._aplicar(e);
        });
        this.canvas.addEventListener('mousemove', e => {
            if (this.pintando && this.herramienta === 'pintar') this._pintar(e);
        });
        // click derecho = cuentagotas
        this.canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            this._pipeta(e);
        });
        window.addEventListener('mouseup', () => { this.pintando = false; });

        this._actualizarBotones();
    }

    _crearBtn(texto, onClick) {
        const b = document.createElement('button');
        b.textContent = texto;
        b.type = 'button';
        Object.assign(b.style, {
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '4px', color: '#fff', cursor: 'pointer',
            fontFamily: '"PixeloidMono", monospace, sans-serif',
            fontSize: '10px', padding: '4px 8px', whiteSpace: 'nowrap',
        });
        b.addEventListener('pointerenter', () => {
            if (b.dataset.activo !== '1') b.style.background = 'rgba(255,255,255,0.1)';
        });
        b.addEventListener('pointerleave', () => {
            if (b.dataset.activo !== '1') b.style.background = 'rgba(255,255,255,0.05)';
        });
        b.addEventListener('click', onClick);
        return b;
    }

    _span(texto, css) {
        const s = document.createElement('span');
        s.textContent = texto;
        s.style.cssText = css;
        return s;
    }

    _estilarSelect(sel) {
        Object.assign(sel.style, {
            background: '#111', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px', color: '#fff', padding: '3px 6px',
            fontFamily: '"PixeloidMono", monospace, sans-serif',
            fontSize: '10px', cursor: 'pointer',
        });
    }

    _marcarActivo(btn, activo) {
        btn.dataset.activo = activo ? '1' : '0';
        btn.style.borderColor = activo ? '#fff' : 'rgba(255,255,255,0.18)';
        btn.style.background  = activo ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
    }

    _actualizarBotones() {
        if (!this.btnVisual) return;
        this._marcarActivo(this.btnVisual,   this.capa === 'visual');
        this._marcarActivo(this.btnColision, this.capa === 'colision');
        this._marcarActivo(this.btnPintar,   this.herramienta === 'pintar');
        this._marcarActivo(this.btnRellenar, this.herramienta === 'rellenar');
    }

    _setCapa(c) {
        this.capa = c;
        this._actualizarBotones();
        this._construirPaleta();
        this._renderizar();
    }

    _setHerramienta(h) {
        this.herramienta = h;
        this._actualizarBotones();
    }

    async cargarMapa(nombre) {
        this.mapaActual = nombre;
        this.selId = 0;
        if (this.lblEstado) this.lblEstado.textContent = 'cargando...';

        try {
            const base = `maps/${nombre}/`;
            const [csvMapa, csvLogica, txtDefs] = await Promise.all([
                fetch(base + 'map.csv').then(r => r.text()),
                fetch(base + 'collisions.csv').then(r => r.text()),
                fetch(base + 'definitions.jsonc').then(r => r.text()),
            ]);

            const defs = parsearJSONC(txtDefs);
            this.datos = { mapa: parseCSV(csvMapa), logica: parseCSV(csvLogica), defs };

            // precarga imagenes de tiles
            await Promise.allSettled(
                Object.values(defs.tiles || {}).map(src =>
                    this._cargarImg(src).then(img => { this.imgCache[src] = img; })
                )
            );

            this._construirPaleta();
            this._resizearCanvas();
            this._renderizar();
            if (this.lblEstado) this.lblEstado.textContent = '';
        } catch (err) {
            if (this.lblEstado) this.lblEstado.textContent = 'error al cargar';
            console.error('[Editor] error cargando mapa:', err);
        }
    }

    _cargarImg(src) {
        if (this.imgCache[src]) return Promise.resolve(this.imgCache[src]);
        return new Promise(res => {
            const img = new Image();
            img.onload  = () => res(img);
            img.onerror = () => res(null);
            img.src = src;
        });
    }

    _construirPaleta() {
        if (!this.datos || !this.panelPaleta) return;
        const { defs } = this.datos;
        this.panelPaleta.innerHTML = '';

        this.panelPaleta.appendChild(this._span(
            this.capa === 'visual' ? 'TILES VISUALES' : 'COLISIONES',
            'opacity:.35;font-size:8px;letter-spacing:.06em;margin-bottom:4px;'
        ));

        const fuente = this.capa === 'visual' ? defs.tiles : defs.collisions;
        if (!fuente) return;

        Object.entries(fuente).forEach(([id, val]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.id = id;
            Object.assign(btn.style, {
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 5px', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '3px', background: 'transparent',
                color: '#fff', cursor: 'pointer', width: '100%',
                fontFamily: '"PixeloidMono", monospace, sans-serif',
                fontSize: '9px', textAlign: 'left',
            });

            if (this.capa === 'visual') {
                const preview = document.createElement('div');
                Object.assign(preview.style, {
                    width: '20px', height: '20px', flexShrink: '0',
                    imageRendering: 'pixelated',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backgroundImage: `url(${val})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                });
                btn.appendChild(preview);
                const lbl = document.createElement('span');
                lbl.textContent = `[${id}]`;
                btn.appendChild(lbl);
            } else {
                const tipo = val.type ?? '?';
                const dot = document.createElement('div');
                Object.assign(dot.style, {
                    width: '14px', height: '14px', flexShrink: '0',
                    borderRadius: '2px', background: tipoAColor(tipo),
                    border: '1px solid rgba(255,255,255,0.12)',
                });
                btn.appendChild(dot);
                const lbl = document.createElement('span');
                lbl.textContent = tipo;
                lbl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
                btn.appendChild(lbl);
                const idlbl = document.createElement('span');
                idlbl.textContent = `[${id}]`;
                idlbl.style.cssText = 'opacity:.35;font-size:8px;flex-shrink:0;';
                btn.appendChild(idlbl);
            }

            btn.addEventListener('click', () => {
                this.selId = Number(id);
                this._actualizarPaleta();
            });
            btn.addEventListener('pointerenter', () => {
                if (Number(id) !== this.selId) btn.style.background = 'rgba(255,255,255,0.06)';
            });
            btn.addEventListener('pointerleave', () => {
                if (Number(id) !== this.selId) btn.style.background = 'transparent';
            });
            this.panelPaleta.appendChild(btn);
        });

        this._actualizarPaleta();
    }

    _actualizarPaleta() {
        this.panelPaleta?.querySelectorAll('button[data-id]').forEach(btn => {
            const sel = Number(btn.dataset.id) === this.selId;
            btn.style.borderColor = sel ? '#fff' : 'rgba(255,255,255,0.08)';
            btn.style.background  = sel ? 'rgba(255,255,255,0.12)' : 'transparent';
        });
    }

    _resizearCanvas() {
        if (!this.datos) return;
        const { mapa } = this.datos;
        this.canvas.width  = (mapa[0]?.length ?? 0) * TILE_PX;
        this.canvas.height = mapa.length * TILE_PX;
    }

    _renderizar() {
        if (!this.datos || !this.ctx) return;
        const { mapa } = this.datos;
        for (let y = 0; y < mapa.length; y++) {
            for (let x = 0; x < (mapa[0]?.length ?? 0); x++) {
                this._dibujarTile(x, y);
            }
        }
    }

    _dibujarTile(x, y) {
        if (!this.datos || !this.ctx) return;
        const { mapa, logica, defs } = this.datos;
        const ctx = this.ctx;
        const px = x * TILE_PX;
        const py = y * TILE_PX;

        if (this.capa === 'visual') {
            const id  = mapa[y]?.[x] ?? 0;
            const src = defs.tiles[id];
            const img = src ? this.imgCache[src] : null;
            if (img) {
                ctx.drawImage(img, px, py, TILE_PX, TILE_PX);
            } else {
                ctx.fillStyle = '#0a0a0a';
                ctx.fillRect(px, py, TILE_PX, TILE_PX);
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '7px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(id), px + TILE_PX / 2, py + TILE_PX / 2);
            }
        } else {
            const id   = logica[y]?.[x] ?? 0;
            const def  = defs.collisions[id];
            const tipo = def?.type ?? '?';
            ctx.fillStyle = tipoAColor(tipo);
            ctx.fillRect(px, py, TILE_PX, TILE_PX);
            // texto del tipo
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tipo.slice(0, 5), px + TILE_PX / 2, py + TILE_PX / 2 - 3);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '6px monospace';
            ctx.fillText(`[${id}]`, px + TILE_PX / 2, py + TILE_PX / 2 + 5);
        }

        // grilla
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, TILE_PX, TILE_PX);
    }

    _posDesdeEvento(e) {
        const rect = this.canvas.getBoundingClientRect();
        const escala = this.canvas.width / rect.width;
        return {
            x: Math.floor((e.clientX - rect.left) * escala / TILE_PX),
            y: Math.floor((e.clientY - rect.top)  * escala / TILE_PX),
        };
    }

    _aplicar(e) {
        if (this.herramienta === 'pintar') this._pintar(e);
        else if (this.herramienta === 'rellenar') {
            const { x, y } = this._posDesdeEvento(e);
            this._rellenar(x, y);
        }
    }

    _pintar(e) {
        if (!this.datos) return;
        const { x, y } = this._posDesdeEvento(e);
        const { mapa, logica } = this.datos;
        const grid = this.capa === 'visual' ? mapa : logica;
        if (y < 0 || y >= grid.length || x < 0 || x >= (grid[0]?.length ?? 0)) return;
        if (grid[y][x] === this.selId) return;
        grid[y][x] = this.selId;
        this._marcarSucio();
        this._dibujarTile(x, y);
    }

    // cuentagotas con click derecho
    _pipeta(e) {
        if (!this.datos) return;
        const { x, y } = this._posDesdeEvento(e);
        const { mapa, logica } = this.datos;
        const grid = this.capa === 'visual' ? mapa : logica;
        if (y >= 0 && y < grid.length && x >= 0 && x < (grid[0]?.length ?? 0)) {
            this.selId = grid[y][x];
            this._actualizarPaleta();
        }
    }

    _rellenar(sx, sy) {
        if (!this.datos) return;
        const { mapa, logica } = this.datos;
        const grid = this.capa === 'visual' ? mapa : logica;
        const h = grid.length;
        const w = grid[0]?.length ?? 0;
        if (sy < 0 || sy >= h || sx < 0 || sx >= w) return;
        const targetId = grid[sy][sx];
        if (targetId === this.selId) return;

        // flood fill bfs
        const cola  = [[sx, sy]];
        const visto = new Set([`${sx},${sy}`]);
        while (cola.length) {
            const [cx, cy] = cola.shift();
            grid[cy][cx] = this.selId;
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const nx = cx + dx, ny = cy + dy;
                const k  = `${nx},${ny}`;
                if (!visto.has(k) && nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] === targetId) {
                    visto.add(k);
                    cola.push([nx, ny]);
                }
            }
        }
        this._marcarSucio();
        this._renderizar();
    }

    _marcarSucio() {
        if (this.lblEstado) this.lblEstado.textContent = '● sin guardar';
    }

    async guardar() {
        if (!this.datos) return;
        const { mapa, logica } = this.datos;

        const textoOriginal = this.btnGuardar.textContent;
        this.btnGuardar.textContent = '⏳ Guardando...';
        this.btnGuardar.disabled = true;

        try {
            const [r1, r2] = await Promise.all([
                fetch('/api/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: `maps/${this.mapaActual}/map.csv`, content: csvAString(mapa) }),
                }),
                fetch('/api/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: `maps/${this.mapaActual}/collisions.csv`, content: csvAString(logica) }),
                }),
            ]);

            if (!r1.ok || !r2.ok) throw new Error('respuesta no-ok');

            if (this.lblEstado) this.lblEstado.textContent = '✓ guardado';
            this.btnGuardar.textContent = '✓ Guardado';
            setTimeout(() => {
                this.btnGuardar.textContent = textoOriginal;
                if (this.lblEstado) this.lblEstado.textContent = '';
            }, 2000);
        } catch (err) {
            this.btnGuardar.textContent = '✗ Error';
            if (this.lblEstado) this.lblEstado.textContent = 'error al guardar';
            console.error('[Editor] fallo al guardar:', err);
            setTimeout(() => { this.btnGuardar.textContent = textoOriginal; }, 2000);
        } finally {
            this.btnGuardar.disabled = false;
        }
    }
}

export const editor = new Editor();
