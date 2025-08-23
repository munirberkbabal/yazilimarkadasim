const express = require('express');
const bodyParser = require('body-parser'); // body-parser hala gerekebilir, ancak express.json() ve urlencoded() yeterli
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer'); // Multer'ı dahil et

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your_super_secret_key'; // Güçlü ve gizli bir anahtar kullanın!
// Render test endpoint
app.get('/', (req, res) => {
    res.send('Backend Render üzerinde çalışıyor 🚀');
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer depolama ayarları (profil resmi için)
// Bellekte depolama, diske kaydetme işlemini manuel yapacaksanız veya küçük dosyalar için kullanışlıdır.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// CORS ayarları (Flutter uygulamasının backend'e erişmesi için gerekli)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Tüm origin'lerden gelen isteklere izin ver
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Veri dosyası yolları
const usersFilePath = path.join(__dirname, 'data', 'users.json');
const postsFilePath = path.join(__dirname, 'data', 'posts.json');
const commentsFilePath = path.join(__dirname, 'data', 'comments.json');
const friendshipsFilePath = path.join(__dirname, 'data', 'friendships.json');
const messagesFilePath = path.join(__dirname, 'data', 'messages.json');


// Yardımcı fonksiyonlar
const readData = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            fs.writeFileSync(filePath, '[]', 'utf8'); // Dosya yoksa boş array ile oluştur
            return [];
        }
        console.error(`Dosya okunurken hata oluştu ${filePath}:`, error);
        return [];
    }
};

const writeData = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Dosyaya yazılırken hata oluştu ${filePath}:`, error);
    }
};

// JWT Kimlik Doğrulama Middleware'i
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401); // Yetkilendirme hatası
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.sendStatus(403); // Geçersiz token
        }
        req.user = user;
        next();
    });
};


// --- Kimlik Doğrulama Uç Noktaları ---

// Kullanıcı Kaydı
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    const users = readData(usersFilePath);

    // Kullanıcı adı veya e-posta zaten kullanımda mı kontrol et
    if (users.some(u => u.username === username)) {
        return res.status(409).json({ message: 'Bu kullanıcı adı zaten alınmış.' });
    }
    if (users.some(u => u.email === email)) {
        return res.status(409).json({ message: 'Bu e-posta adresi zaten kullanımda.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
        id: uuidv4(),
        username,
        email,
        passwordHash,
        bio: "",
        profilePic: "",
        age: null, // Yeni eklenen alan
        gender: null, // Yeni eklenen alan
        softwareInterest: null // Yeni eklenen alan
    };
    users.push(newUser);
    writeData(usersFilePath, users);
    res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.', userId: newUser.id });
});

// Kullanıcı Girişi
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readData(usersFilePath);
    const user = users.find(u => u.email === email);

    if (!user) {
        return res.status(400).json({ message: 'Geçersiz e-posta veya şifre.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
        return res.status(400).json({ message: 'Geçersiz e-posta veya şifre.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token, userId: user.id, username: user.username });
});

// --- Profil Uç Noktaları ---

// Kullanıcı Profili Getir
app.get('/api/profile/:userId', authenticateToken, (req, res) => {
    const { userId } = req.params;
    const users = readData(usersFilePath);
    const user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    // Şifre hash'ini göndermemek için güvenli bir kullanıcı nesnesi oluştur
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
});

// Kullanıcı Profilini Güncelle
app.put('/api/update-profile', authenticateToken, upload.single('profilePic'), async (req, res) => {
    const userId = req.user.id;
    const { bio, age, gender, softwareInterest } = req.body; // bio, age, gender, softwareInterest
    let profilePicBase64 = null;

    if (req.file) {
    // Multer memoryStorage kullandığı için buffer'dan alıyoruz
    profilePicBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
} else if (req.body.profilePic) {
        // Eğer resim dosyası yoksa ama client'tan mevcut bir base64 URL geliyorsa (resim değişmediyse)
        profilePicBase64 = req.body.profilePic;
    }

    const users = readData(usersFilePath);
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    // req.body içeriği bazen string olarak gelebilir, JSON ise parse et
    let bioParsed = req.body.bio;
    let ageParsed = req.body.age;
    let genderParsed = req.body.gender;
    let softwareInterestParsed = req.body.softwareInterest;
    if (typeof bioParsed === 'string' && req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        // Flutter bazen tüm alanları string olarak yollar, gerekirse parse et
        try {
            bioParsed = JSON.parse(bioParsed);
        } catch {}
        try {
            ageParsed = JSON.parse(ageParsed);
        } catch {}
        try {
            genderParsed = JSON.parse(genderParsed);
        } catch {}
        try {
            softwareInterestParsed = JSON.parse(softwareInterestParsed);
        } catch {}
    }

    users[userIndex] = {
        ...users[userIndex],
        bio: bioParsed ?? users[userIndex].bio,
        age: ageParsed ?? users[userIndex].age,
        gender: genderParsed ?? users[userIndex].gender,
        softwareInterest: softwareInterestParsed ?? users[userIndex].softwareInterest,
        profilePic: profilePicBase64 !== null ? profilePicBase64 : users[userIndex].profilePic // Yeni resim yoksa veya boşsa mevcut resim URL'sini koru
    };

    writeData(usersFilePath, users);
    const { passwordHash, ...safeUser } = users[userIndex]; // Şifre hash'ini dışarıda bırak
    res.json({ message: 'Profil başarıyla güncellendi!', user: safeUser });
});

// --- Gönderi Uç Noktaları ---

// Bir gönderiyi sil
app.delete('/api/posts/:postId', authenticateToken, (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id; // İsteği yapan kullanıcının ID'si
    let posts = readData(postsFilePath); // Var ile tanımlandı, let yapıldı

    const postIndex = posts.findIndex(p => p.id === postId);

    if (postIndex === -1) {
        return res.status(404).json({ message: 'Gönderi bulunamadı.' });
    }

    // Gönderinin, isteği yapan kullanıcıya ait olup olmadığını kontrol et
    if (posts[postIndex].userId !== userId) {
        return res.status(403).json({ message: 'Bu gönderiyi silmeye yetkiniz yok.' });
    }

    // Gönderiyi diziden kaldır
    const deletedPost = posts.splice(postIndex, 1);
    writeData(postsFilePath, posts);

    res.status(200).json({ message: 'Gönderi başarıyla silindi.', deletedPostId: postId });
});

// Tüm gönderileri getir
// server.js içinde, authenticateToken middleware'ından sonra
// Örnek bir GET /api/posts uç noktası
app.get('/api/posts', authenticateToken, (req, res) => {
    const posts = readData(postsFilePath); // Gönderi verilerinizi okuyun
    const users = readData(usersFilePath); // Kullanıcı verilerinizi okuyun (profil resimleri için)

    // Her gönderiye, gönderi sahibinin kullanıcı adı ve profil resmini ekle
    const postsWithUserDetails = posts.map(post => {
        const user = users.find(u => u.id === post.userId);
        return {
            ...post,
            username: user ? user.username : 'Bilinmeyen Kullanıcı',
            profilePicUrl: user ? user.profilePic : null // Burası önemli!
        };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // En yeni gönderiler üstte

    res.json(postsWithUserDetails);
});

// Tek bir gönderiyi getir
app.get('/api/posts/:postId', authenticateToken, (req, res) => {
    const { postId } = req.params;
    const posts = readData(postsFilePath);
    const users = readData(usersFilePath);

    const post = posts.find(p => p.id === postId);
    
    if (!post) {
        return res.status(404).json({ message: 'Gönderi bulunamadı.' });
    }

    // Gönderi sahibinin kullanıcı adı ve profil resmini ekle
    const user = users.find(u => u.id === post.userId);
    const postWithUserDetails = {
        ...post,
        username: user ? user.username : 'Bilinmeyen Kullanıcı',
        profilePicUrl: user ? user.profilePic : null
    };

    res.json(postWithUserDetails);
});

// Yeni gönderi oluştur
app.post('/api/posts', authenticateToken, upload.single('postImage'), async (req, res) => {
    console.log('--- Gönderi Oluşturma İsteği Alındı ---');
    console.log('Request Headers:', req.headers);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('req.body (Multer sonrası):', req.body);
    console.log('req.file (Multer sonrası):', req.file);

    // req.body.content bazen undefined olabiliyor, bu yüzden hem req.body hem de req.body['content'] kontrolü
    const content = req.body.content || req.body['content'];
    if (content === undefined) {
        console.error('HATA: req.body.content tanımsız. İstek gövdesi düzgün ayrıştırılamadı veya içerik eksik.');
        return res.status(400).json({ message: 'Gönderi içeriği eksik veya hatalı.' });
    }

    // Kullanıcı kimliğini al
    const userId = req.user.id;
    const username = req.user.username;

    // Base64 resim verisini al
    let imageUrl = null;
    if (req.file) {
        const imageBuffer = req.file.buffer;
        const imageBase64 = imageBuffer.toString('base64');
        imageUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
        console.log('Resim başarıyla alındı ve Base64 formatına dönüştürüldü.');
    } else {
        console.log('Resim dosyası yüklenmedi.');
    }

    // Gönderi objesini oluştur
    const newPost = {
        id: uuidv4(),
        userId,
        username,
        content,
        imageUrl,
        likes: [],
        comments: [],
        createdAt: new Date().toISOString()
    };

    const posts = readData(postsFilePath);
    posts.push(newPost);
    writeData(postsFilePath, posts);

    res.status(201).json({ message: 'Gönderi başarıyla oluşturuldu!', post: newPost });
});

// Gönderiyi Beğen/Beğenme
app.post('/api/posts/:postId/like', authenticateToken, (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;
    const posts = readData(postsFilePath);
    const postIndex = posts.findIndex(p => p.id === postId);

    if (postIndex === -1) {
        return res.status(404).json({ message: 'Gönderi bulunamadı.' });
    }

    const post = posts[postIndex];
    const likeIndex = post.likes.indexOf(userId);

    if (likeIndex === -1) {
        post.likes.push(userId); // Beğen
        res.json({ message: 'Gönderi beğenildi.', liked: true });
    } else {
        post.likes.splice(likeIndex, 1); // Beğeniyi geri al
        res.json({ message: 'Gönderi beğenisi geri alındı.', liked: false });
    }

    writeData(postsFilePath, posts);
});

// server.js dosyanızda mevcut rotaların arasına ekleyin

// Gönderiyi düzenle (PUT)
app.put('/api/posts/:id', authenticateToken, upload.single('postImage'), (req, res) => {
    const postId = req.params.id;
    const { content, removeImage } = req.body || {};
    let posts = readData(postsFilePath);
    const postIndex = posts.findIndex(p => p.id === postId);

    if (postIndex === -1) {
        return res.status(404).json({ message: 'Gönderi bulunamadı.' });
    }

    // Sadece sahibi düzenleyebilir
    if (posts[postIndex].userId !== req.user.id) {
        return res.status(403).json({ message: 'Bu gönderiyi düzenlemeye yetkiniz yok.' });
    }

    // Eğer hem content hem de (mevcut ve yeni resim yoksa) hata döndür
    const hasContent = typeof content === 'string' && content.trim() !== '';
    const hasImage = !!posts[postIndex].imageUrl;
    const hasNewImage = !!req.file;

    if (!hasContent && !hasImage && !hasNewImage) {
        return res.status(400).json({ message: 'Gönderi içeriği boş olamaz.' });
    }

    // İçeriği güncelle
    if (hasContent) {
        posts[postIndex].content = content;
    }

    // Resmi kaldır
    if (removeImage === 'true' || removeImage === true) {
        posts[postIndex].imageUrl = null;
    }

    // Yeni resim yüklendiyse güncelle
    if (req.file) {
        const imageBuffer = req.file.buffer;
        const imageBase64 = imageBuffer.toString('base64');
        posts[postIndex].imageUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
    }

    posts[postIndex].updatedAt = new Date().toISOString();
    writeData(postsFilePath, posts);

    res.json({ message: 'Gönderi başarıyla güncellendi.', post: posts[postIndex] });
});

// Gönderiye Yorum Yap
app.post('/api/posts/:postId/comments', authenticateToken, (req, res) => {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (!content) {
        return res.status(400).json({ message: 'Yorum içeriği boş olamaz.' });
    }

    const posts = readData(postsFilePath);
    const postIndex = posts.findIndex(p => p.id === postId);

    if (postIndex === -1) {
        return res.status(404).json({ message: 'Gönderi bulunamadı.' });
    }

    const newComment = {
        id: uuidv4(),
        userId,
        username,
        content,
        createdAt: new Date().toISOString()
    };

    posts[postIndex].comments.push(newComment); // Gönderinin kendi comments dizisine ekle
    writeData(postsFilePath, posts);

    // Ayrıca, genel yorumlar dosyasına da ekleyebiliriz (isteğe bağlı, şu anki yapıda sadece posta bağlı)
    // const comments = readData(commentsFilePath);
    // comments.push({ postId, ...newComment });
    // writeData(commentsFilePath, comments);

    res.status(201).json({ message: 'Yorum başarıyla eklendi.', comment: newComment });
});

// Bir gönderiye ait tüm yorumları getir
app.get('/api/posts/:postId/comments', authenticateToken, (req, res) => {
    const { postId } = req.params;
    const posts = readData(postsFilePath);
    const post = posts.find(p => p.id === postId);

    if (!post) {
        return res.status(404).json({ message: 'Gönderi bulunamadı.' });
    }

    res.json(post.comments || []); // Yorumları döndür, yoksa boş dizi
});

// --- Arkadaşlık Uç Noktaları ---

// Arkadaşlık isteği gönder
app.post('/api/friend-request', authenticateToken, (req, res) => {
    const { receiverId } = req.body;
    const senderId = req.user.id;
    const friendships = readData(friendshipsFilePath);

    if (senderId === receiverId) {
        return res.status(400).json({ message: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });
    }

    // Zaten bir istek var mı veya zaten arkadaş mı kontrol et
    const existingRequest = friendships.some(f =>
        ((f.senderId === senderId && f.receiverId === receiverId) || (f.senderId === receiverId && f.receiverId === senderId))
        && (f.status === 'pending' || f.status === 'accepted')
    );

    if (existingRequest) {
        return res.status(400).json({ message: 'Zaten bekleyen bir arkadaşlık isteğiniz var veya zaten arkadaşsınız.' });
    }

    const newRequest = {
        id: uuidv4(),
        senderId,
        receiverId,
        status: 'pending', // 'pending', 'accepted', 'rejected'
        createdAt: new Date().toISOString()
    };
    friendships.push(newRequest);
    writeData(friendshipsFilePath, friendships);
    res.status(201).json({ message: 'Arkadaşlık isteği gönderildi.', request: newRequest });
});

// Arkadaşlık isteğini kabul et/reddet
app.put('/api/friend-request/:requestId', authenticateToken, (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body; // 'accepted' veya 'rejected'
    const userId = req.user.id;
    const friendships = readData(friendshipsFilePath);

    const requestIndex = friendships.findIndex(r => r.id === requestId);

    if (requestIndex === -1) {
        return res.status(404).json({ message: 'Arkadaşlık isteği bulunamadı.' });
    }

    const request = friendships[requestIndex];

    // Sadece alıcı isteği kabul edebilir veya reddedebilir
    if (request.receiverId !== userId) {
        return res.status(403).json({ message: 'Bu isteği düzenleme yetkiniz yok.' });
    }

    if (status === 'accepted' || status === 'rejected') {
        request.status = status;
        writeData(friendshipsFilePath, friendships);
        res.json({ message: `Arkadaşlık isteği ${status === 'accepted' ? 'kabul edildi' : 'reddedildi'}.`, request });
    } else {
        res.status(400).json({ message: 'Geçersiz durum.' });
    }
});

// Bekleyen Arkadaşlık İsteklerini Getir (sana gelenler)
app.get('/api/friend-requests/pending', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const friendships = readData(friendshipsFilePath);
    const users = readData(usersFilePath);

    const pendingRequests = friendships.filter(f =>
        f.receiverId === userId && f.status === 'pending'
    );

    // Gönderenlerin kullanıcı adlarını da ekleyelim
    const requestsWithSenderInfo = pendingRequests.map(request => {
        const sender = users.find(u => u.id === request.senderId);
        return {
            ...request,
            senderUsername: sender ? sender.username : 'Bilinmeyen Kullanıcı'
        };
    });

    res.json(requestsWithSenderInfo);
});


// Kullanıcının Arkadaşlarını Getir
app.get('/api/friends', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const friendships = readData(friendshipsFilePath);
    const users = readData(usersFilePath);

    const acceptedFriendships = friendships.filter(f =>
        f.status === 'accepted' && (f.senderId === userId || f.receiverId === userId)
    );

    const friendInfos = acceptedFriendships.map(f => {
        const friendId = f.senderId === userId ? f.receiverId : f.senderId;
        const friendUser = users.find(u => u.id === friendId);
        if (friendUser) {
            const { passwordHash, ...safeFriendUser } = friendUser;
            return safeFriendUser;
        }
        return null;
    }).filter(Boolean); // null olanları filtrele

    res.json(friendInfos);
});

// Tüm Kullanıcıları Getir (Arkadaş eklemek için arama)
app.get('/api/users', authenticateToken, (req, res) => {
    const users = readData(usersFilePath);
    const currentUser = req.user.id;
    const friendships = readData(friendshipsFilePath);

    // Kendini ve zaten arkadaş veya bekleyen isteği olanları listeleme
    const filteredUsers = users.filter(user => {
        if (user.id === currentUser) return false; // Kendini hariç tut

        const isFriend = friendships.some(f =>
            f.status === 'accepted' &&
            ((f.senderId === currentUser && f.receiverId === user.id) || (f.senderId === user.id && f.receiverId === currentUser))
        );
        if (isFriend) return false;

        const hasPendingRequest = friendships.some(f =>
            f.status === 'pending' &&
            ((f.senderId === currentUser && f.receiverId === user.id) || (f.senderId === user.id && f.receiverId === currentUser))
        );
        if (hasPendingRequest) return false;

        return true;
    }).map(user => {
        const { passwordHash, ...safeUser } = user;
        return safeUser;
    });

    res.json(filteredUsers);
});

// --- Mesajlaşma Uç Noktaları ---

// Belirli bir arkadaşla mesajları getir
app.get('/api/messages/:friendId', authenticateToken, (req, res) => {
    const { friendId } = req.params;
    const userId = req.user.id;
    const messages = readData(messagesFilePath);

    const relevantMessages = messages.filter(msg =>
        (msg.senderId === userId && msg.receiverId === friendId) ||
        (msg.senderId === friendId && msg.receiverId === userId)
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // Tarihe göre sırala

    res.json(relevantMessages);
});

// Yeni mesaj gönder
app.post('/api/messages', authenticateToken, (req, res) => {
    const { receiverId, content } = req.body;
    const senderId = req.user.id;
    const messages = readData(messagesFilePath);

    if (!content || !receiverId) {
        return res.status(400).json({ message: 'Mesaj içeriği veya alıcı eksik.' });
    }

    const newMessage = {
        id: uuidv4(),
        senderId,
        receiverId,
        content,
        createdAt: new Date().toISOString()
    };

    messages.push(newMessage);
    writeData(messagesFilePath, messages);
    res.status(201).json({ message: 'Mesaj başarıyla gönderildi.', message: newMessage });
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});