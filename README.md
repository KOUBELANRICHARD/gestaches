# Gestaches

Application mobile-first React/Node.js pour organiser les taches, objectifs, horaires de travail, formations et rappels.

## Choix Hostinger

Choisir **Application Web Node.js**.

Cette version est une PWA React servie par un backend Node.js. Elle est plus adaptee aux notifications telephone, a l'installation sur smartphone et aux futures evolutions.

## Installation locale

```bash
npm install
npm run build
npm start
```

Puis ouvrir `http://localhost:3000`.

En developpement:

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`
API Node: `http://localhost:3000`

## Variables d'environnement

Copier `.env.example` vers `.env`.

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
APP_TIMEZONE=America/Moncton
PORT=3000
DATA_DIR=../gestaches-data
```

Pour les notifications push:

```bash
npm run vapid
```

Copier les cles generees dans `.env`:

```bash
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:votre-email@example.com
```

## Notifications telephone

1. Deployer l'application en HTTPS.
2. Ouvrir l'application sur le telephone.
3. Installer la PWA sur l'ecran d'accueil.
4. Activer les notifications dans l'application.

Le serveur enverra:

- un rappel 30 minutes avant un bloc planifie;
- un resume du planning de la journee le matin.

## Donnees

Les donnees sont dans `app-data.json` sous le dossier `DATA_DIR`.

Sur Hostinger, ajouter cette variable d'environnement:

```bash
DATA_DIR=../gestaches-data
```

Cette valeur place les donnees hors du dossier source remplace pendant les redeploiements. Avant une mise a jour, aller dans **Avatar > Parametrage > Sauvegarde des donnees** pour telecharger une copie JSON.
