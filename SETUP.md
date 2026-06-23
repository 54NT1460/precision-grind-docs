# Precision Grind — Setup Guide

## Lo que tienes
- `index.html` — La app completa (abre en cualquier navegador)
- `gas_backend.js` — El código del servidor (Google Apps Script)
- `SETUP.md` — Este archivo

---

## Paso 1: Subir a GitHub Pages (acceso desde cualquier dispositivo)

1. Ve a [github.com](https://github.com) y crea una cuenta si no tienes
2. Crea un repositorio nuevo → nombre: `precision-grind-docs` → Public
3. Sube los archivos: `index.html` + la carpeta `js/` con `app.js`
4. Ve a **Settings → Pages → Branch: main → Save**
5. Tu app estará en: `https://TU-USUARIO.github.io/precision-grind-docs/`
6. Guarda ese link como bookmark en tu iPhone, iPad y laptop

---

## Paso 2: Google Sheets como base de datos

### 2a. Crear el Google Sheet
1. Ve a [sheets.google.com](https://sheets.google.com)
2. Crea una hoja nueva → nómbrala: **Precision Grind DB**
3. No necesitas crear columnas — el sistema las crea solo

### 2b. Crear el Apps Script
1. En el Google Sheet, ve a **Extensions → Apps Script**
2. Borra el código que hay por defecto
3. Copia y pega **todo** el contenido del archivo `gas_backend.js`
4. Haz clic en 💾 Guardar
5. Haz clic en **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Haz clic en **Deploy**
7. Copia la URL que termina en `/exec`

### 2c. Conectar la app
1. Abre tu app (`index.html` o la URL de GitHub Pages)
2. Ve a **Configuración** (ícono ⚙️)
3. Pega la URL de Apps Script en el campo
4. Haz clic en **Guardar y Conectar**
5. El punto verde ✓ confirma la conexión

---

## Uso diario

### En el campo (iPhone/iPad)
1. Abre Safari → ve a tu URL de GitHub Pages
2. Toca el botón Compartir → **"Añadir a pantalla de inicio"**
3. Ahora tienes un ícono como una app

### Crear una Factura
1. Toca **Factura** en el menú
2. Selecciona cliente (o escribe uno nuevo)
3. Añade líneas: **+ Labor** (tarifa fija) o **+ Material** (del catálogo)
4. Completa los datos de garantía
5. Toca **Generar Factura + Garantía PDF**
6. El PDF se descarga → comparte por WhatsApp o email

### Numeración automática
- Formato: `YY-Q##` → Año (2 dígitos) - Trimestre (1 dígito) + Secuencia (2 dígitos)
- Ejemplo: `26-201` = Año 2026, Q2, documento #01
- El contador sube automáticamente con cada documento

### Cotización → Factura
- Completa la cotización y genera el PDF para el cliente
- Cuando aprueban, ve a **Factura** → los datos se ingresan ahí
- *(Conversión automática en próxima versión)*

---

## Markup y precios
- Ve a **Configuración** para cambiar el % de markup (default: 25%)
- Al cambiar el markup, todos los materiales del catálogo se recalculan
- Fórmula: `Precio HD × 1.115 (IVU) × 1.25 (markup) = Precio final`

---

## Soporte
- Teléfono: 939.218.2827
- Email: bgtheholdingcompany@gmail.com
