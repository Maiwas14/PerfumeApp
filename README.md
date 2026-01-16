# Perfume AI Scanner 👃✨ (Version Alpha)

Una aplicación móvil inteligente diseñada para amantes de los perfumes. Utiliza
Inteligencia Artificial (Google Gemini 2.0 Flash) para identificar fragancias a
partir de una foto y proporcionar un análisis detallado de sus notas, ocasiones
de uso y recomendaciones.

## 🚀 Características

- **Scanner de Perfumes**: Identificación instantánea mediante la cámara.
- **Análisis de Notas**: Desglose completo de la pirámide olfativa (Salida,
  Corazón y Fondo).
- **Sommelier de IA**: Recomendaciones personalizadas sobre cuándo y dónde usar
  cada fragancia (Gym, Oficina, Citas, etc.).
- **Mi Colección**: Guarda tus perfumes favoritos y gestiona tu colección
  personal.
- **Sincronización en la Nube**: Desarrollado con Supabase para mantener tus
  datos seguros y accesibles.

## 🛠️ Tecnologías

- **Frontend**: React Native con Expo.
- **Backend / DB**: Supabase (Edge Functions & PostgreSQL).
- **IA**: Google Gemini 2.0 Flash API.
- **Estilos**: Vanilla CSS / Styled-components logic.

## 📦 Instalación y Configuración

1. **Clonar el proyecto**:
   ```bash
   git clone https://github.com/Maiwas14/PerfumeApp.git
   cd PerfumeApp
   ```

2. **Configurar variables de entorno**:
   - Copia el archivo `.env.example` a `.env` (en la carpeta `mobile` y
     `supabase` según corresponda).
   - Registra tu propia `GOOGLE_API_KEY` desde
     [Google AI Studio](https://aistudio.google.com/).
   - Configura tus credenciales de Supabase.

3. **Instalar dependencias del móvil**:
   ```bash
   cd mobile
   npm install
   ```

4. **Ejecutar la App**:
   ```bash
   npx expo start
   ```

## 🛡️ Seguridad

Este proyecto utiliza variables de entorno para manejar llaves de API sensibles.
Asegúrate de no subir nunca tu archivo `.env` o credenciales hardcodeadas a
repositorios públicos.

---

Desarrollado con ❤️ para coleccionistas de fragancias.
