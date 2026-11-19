// Firebase(認証 + Firestore)で、端末間の同期を行う。設定は firebase-config.js に書く。
const VERSION = '12.4.0';
const CDN = 'https://www.gstatic.com/firebasejs/' + VERSION + '/';

export async function startSync(config, handlers) {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-firestore.js')
  ]);

  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);

  let db;
  try {
    // 端末内にも保存しておき、オフラインでも記録できて、つながったときに自動で反映する
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
    });
  } catch (e) {
    db = fsMod.getFirestore(app);
  }

  let uid = null;
  let unsubscribe = null;

  const docRef = (id) => fsMod.doc(db, 'users', uid, 'logs', id);
  const fail = (err) => handlers.onError && handlers.onError(err);

  authMod.onAuthStateChanged(auth, (user) => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    if (!user) {
      uid = null;
      handlers.onAuth(null);
      return;
    }

    uid = user.uid;
    handlers.onAuth({ uid: user.uid, email: user.email });

    const toUpload = handlers.takeMigration(uid);
    if (toUpload) toUpload.forEach((log) => upsert(log));

    unsubscribe = fsMod.onSnapshot(
      fsMod.collection(db, 'users', uid, 'logs'),
      { includeMetadataChanges: true },
      (snap) => {
        const docs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        handlers.onRemote(docs, { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      },
      fail
    );
  });

  function upsert(log) {
    if (!uid) return;
    // 記録の中身をまるごと保存する(id はドキュメント名として別に使う)
    const data = Object.assign({}, log);
    delete data.id;
    fsMod.setDoc(docRef(log.id), data).catch(fail);
  }

  function remove(id) {
    if (!uid) return;
    fsMod.deleteDoc(docRef(id)).catch(fail);
  }

  return {
    upsert: upsert,
    remove: remove,
    signIn: (email, password) => authMod.signInWithEmailAndPassword(auth, email, password),
    signUp: (email, password) => authMod.createUserWithEmailAndPassword(auth, email, password),
    signOut: () => authMod.signOut(auth),
    resetPassword: (email) => authMod.sendPasswordResetEmail(auth, email)
  };
}
