<div align="center">

# TerminalHub

**Gestor de terminales moderno para Windows — múltiples CMD y PowerShell en una sola ventana, con pestañas, splits y temas.**

*A modern tabbed terminal manager for Windows. Portable, no installation required.*

![Windows](https://img.shields.io/badge/Windows-10%2B-0078D6?logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![xterm.js](https://img.shields.io/badge/xterm.js-5.5-blue)
![Licencia](https://img.shields.io/badge/Licencia-MIT-green)

<img src="docs/screenshot-dark.png" alt="TerminalHub — tema oscuro" width="800" />

</div>

---

## ¿Qué es?

TerminalHub es una aplicación de escritorio que agrupa todas tus consolas en **una sola ventana**. Cada pestaña es un proceso **real** de `cmd.exe` o `powershell.exe` (vía la API ConPTY de Windows, la misma que usa Windows Terminal), renderizado con [xterm.js](https://xtermjs.org/), el emulador de terminal de VS Code.

Pensada para máquinas donde no puedes instalar nada: **ni Windows Terminal, ni Microsoft Store, ni Node, ni runtimes**. Descargas el zip, lo descomprimes y ejecutas el `.exe`. Ideal para servidores RDP.

### Características

- ✅ Terminales reales de **CMD** y **PowerShell** en pestañas
- ✅ **Renombra** cada pestaña con doble click o `F2` ("Servidor", "Git", "Logs"...)
- ✅ **Reordena** las pestañas arrastrándolas
- ✅ **Splits**: divide la ventana en hasta **8 paneles** en cuadrícula para ver varias terminales a la vez
- ✅ **Tema oscuro** (por defecto) y tema claro
- ✅ **Persistencia**: recuerda títulos, orden de pestañas, shell de cada una y tema al reabrir
- ✅ **Aviso de actualización**: la app te avisa cuando hay una versión nueva para descargar
- ✅ Atajos de teclado para todo
- ✅ Copiar/pegar con teclado o click derecho
- ✅ 100 % **portable**: sin instalador, sin permisos de administrador, sin dependencias

| Varios paneles a la vez | Tema claro |
|---|---|
| ![Split](docs/screenshot-split.png) | ![Tema claro](docs/screenshot-light.png) |

## Descarga e instalación

> **Requisitos**: Windows 10 (1809) o superior / Windows Server 2019 o superior, 64 bits. Nada más.

1. Descarga **`TerminalHub-win64-portable.zip`** desde la [página de Releases](https://github.com/wMallll/TerminalHub/releases/latest).
2. Descomprímelo donde quieras (por ejemplo `C:\Tools\TerminalHub`). Clic derecho → *Extraer todo*.
3. Ejecuta **`TerminalHub.exe`**. Eso es todo.

Para tenerlo a mano: clic derecho sobre `TerminalHub.exe` → *Enviar a* → *Escritorio (crear acceso directo)*.

> 💡 ¿Máquina remota por RDP sin navegador? Descarga el zip en tu PC y pásalo por el portapapeles de RDP o por la unidad compartida `\\tsclient\`.

La configuración se guarda automáticamente en `%APPDATA%\TerminalHub\terminalhub-state.json`. Para "resetear" la app, borra ese archivo.

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl` + `T` | Nueva terminal CMD |
| `Ctrl` + `Shift` + `T` | Nueva terminal PowerShell |
| `Ctrl` + `W` | Cerrar la terminal actual |
| `Ctrl` + `Tab` / `Ctrl` + `Shift` + `Tab` | Siguiente / anterior terminal |
| `Ctrl` + `1` … `9` | Ir directamente a la pestaña N |
| `F2` o doble click en la pestaña | Renombrar terminal |
| `Ctrl` + `Shift` + `E` | Agregar panel (hasta 8, prioridad en columnas) |
| `Ctrl` + `Shift` + `O` | Agregar panel (hasta 8, prioridad en filas) |
| `Ctrl` + `Shift` + `W` | Cerrar el panel enfocado (la terminal sigue abierta en su pestaña) |
| `Ctrl` + `Shift` + `C` / `V` | Copiar / pegar |
| `Ctrl` + `C` (con texto seleccionado) | Copiar la selección (sin selección, envía `Ctrl+C` al shell) |
| Click derecho en la terminal | Copia la selección, o pega si no hay selección |
| Click central en una pestaña | Cerrar esa pestaña |

Con la pantalla dividida: la pestaña activa se marca con una línea azul y las visibles en otros paneles con una línea gris. Haz click en un panel para enfocarlo y click en cualquier pestaña para cargarla en el panel enfocado. Al agregar un panel se muestra una de tus pestañas ya abiertas que no estaba a la vista; solo si todas están visibles se abre una terminal nueva. La cuadrícula se reacomoda sola (2, 3, 4… hasta 8 paneles). También puedes hacer **click derecho sobre una pestaña** para abrirla en un panel nuevo, renombrarla o cerrarla.

Si tienes más pestañas de las que entran en la barra, deslízate con la **rueda del mouse** sobre ella (también hay una barra de scroll fina debajo). La pestaña activa siempre se mantiene a la vista. El botón `+` abre el menú para elegir shell, `◐` cambia el tema y `?` muestra la ayuda.

## Abrir tus comandos automáticamente (startup.json)

Si todos los días abrís las mismas terminales (servidores, APIs, watchers...), podés definirlas en un archivo `startup.json` y TerminalHub las abre todas al iniciar, cada una en su pestaña con su nombre:

```json
{
  "cwd": "C:\\Users\\tu-usuario\\Desktop\\APIS",
  "tabs": [
    { "title": "servidor", "command": "python servidor.py" },
    { "title": "worker", "command": "python worker.py" },
    { "title": "bridge", "command": "node bridge.js" },
    { "title": "libre" }
  ]
}
```

- **`cwd`**: carpeta de trabajo para todas las pestañas (opcional; cada pestaña puede tener su propio `"cwd"` que pisa al general).
- **`title`**: nombre de la pestaña (opcional).
- **`command`**: comando a ejecutar al abrir. La terminal queda abierta al terminar, como `cmd /k`. Sin `command`, abre una terminal vacía.
- **`shell`**: `"cmd"` (por defecto) o `"powershell"`.

El archivo puede ir en **cualquiera** de estos dos lugares:

1. `%APPDATA%\TerminalHub\startup.json` — **recomendado**: sobrevive cuando actualizás la app reemplazando su carpeta.
2. Junto a `TerminalHub.exe` (tiene prioridad si existen los dos).

Si hay `startup.json`, esas son las pestañas al iniciar. Si no, la app restaura las pestañas de la última sesión.

## Actualizaciones

Al iniciar, TerminalHub consulta la última versión publicada en este repositorio (API pública de GitHub, sin telemetría ni datos personales). Si hay una versión más nueva, aparece un aviso dentro de la app con el botón **Actualizar**: la app descarga el zip mostrando el progreso, lo instala sola y se reinicia ya actualizada — sin pasos manuales. Tu configuración (pestañas, títulos, tema y `startup.json`) se conserva.

Si la instalación automática no fuera posible (por permisos o falta de conexión), el aviso ofrece la descarga manual: bajás el zip y reemplazás la carpeta.

## Compilar desde el código fuente

Solo necesitas [Node.js](https://nodejs.org) 18+ en la máquina donde compiles (no en la que uses la app).

```bash
git clone https://github.com/wMallll/TerminalHub.git
cd TerminalHub
npm install        # descarga dependencias y binarios nativos precompilados
npm start          # ejecutar en modo desarrollo
npm run pack:win   # generar la app portable en dist/TerminalHub-win32-x64/
```

`npm run pack:win` funciona desde Windows, Linux o macOS. Los binarios nativos (`@lydell/node-pty`) vienen precompilados desde npm, así que **no hace falta Visual Studio ni herramientas de compilación**.

## Arquitectura

```
terminalhub/
├── main.js          Proceso principal: ventana, procesos pty (ConPTY) y persistencia
├── preload.js       Puente seguro (contextBridge) entre interfaz y proceso principal
└── renderer/
    ├── index.html   Estructura de la interfaz
    ├── style.css    Temas oscuro/claro, pestañas, splits
    └── app.js       Pestañas, drag & drop, atajos, splits y estado
```

- El **renderer** dibuja cada terminal con xterm.js y envía las pulsaciones por IPC.
- El **proceso principal** mantiene los procesos pty y reenvía su salida al renderer.
- Seguridad: `contextIsolation` activado, sin `nodeIntegration`; el renderer solo ve la API mínima expuesta en `preload.js`.

### ¿Por qué Electron?

Es la única opción que da emulación de terminal completa (colores, apps interactivas, redimensionado) siendo totalmente autocontenida: la carpeta incluye Chromium, Node y los binarios nativos. Las alternativas .NET no tienen ningún control de terminal embebido maduro, y WebView2 puede no estar instalado en un servidor. El coste es el tamaño del paquete; a cambio, funciona en cualquier Windows 10+ sin instalar absolutamente nada.

## Contribuir

Los issues y pull requests son bienvenidos. Si encuentras un bug o quieres proponer una mejora, [abre un issue](https://github.com/wMallll/TerminalHub/issues).

## Licencia

[MIT](LICENSE) — úsalo, modifícalo y redistribúyelo libremente.
