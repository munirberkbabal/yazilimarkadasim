from PIL import Image, ImageDraw
import math

# 512x512 boyutunda icon oluştur
size = 512
image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

# Gradient arka plan için basit bir yaklaşım - mavi tonları
center_x, center_y = size // 2, size // 2
radius = 240

# Arka plan dairesi
draw.ellipse([center_x - radius, center_y - radius, center_x + radius, center_y + radius], 
             fill=(33, 150, 243, 255), outline=(25, 118, 210, 255), width=8)

# Sol kod parantezi
bracket_points = [(120, 180), (80, 220), (80, 240), (120, 280), (140, 260), (110, 230), (110, 210), (140, 180)]
draw.polygon(bracket_points, fill=(255, 255, 255, 230), outline=(255, 255, 255, 255))

# Sağ kod parantezi  
bracket_points2 = [(392, 180), (372, 180), (402, 210), (402, 230), (372, 260), (392, 280), (432, 240), (432, 220)]
draw.polygon(bracket_points2, fill=(255, 255, 255, 230), outline=(255, 255, 255, 255))

# İki kişi ikonu
# Kişi 1 - kafa
draw.ellipse([175, 175, 225, 225], fill=(255, 255, 255, 230))
# Kişi 1 - vücut
draw.rounded_rectangle([175, 240, 225, 280], radius=10, fill=(255, 255, 255, 230))

# Kişi 2 - kafa  
draw.ellipse([287, 175, 337, 225], fill=(255, 255, 255, 230))
# Kişi 2 - vücut
draw.rounded_rectangle([287, 240, 337, 280], radius=10, fill=(255, 255, 255, 230))

# Bağlantı çizgisi
draw.line([(225, 200), (287, 200)], fill=(255, 255, 255, 230), width=6)

# Kod sembolleri
# Font olmadığı için basit çizgiler ile < / > yapacağız
# <
draw.line([(220, 320), (200, 340), (220, 360)], fill=(255, 255, 255, 230), width=8)
# /
draw.line([(240, 360), (260, 320)], fill=(255, 255, 255, 230), width=8)
# >
draw.line([(280, 320), (300, 340), (280, 360)], fill=(255, 255, 255, 230), width=8)

# Dekoratif noktalar
dots = [(160, 320), (180, 340), (200, 360), (352, 320), (332, 340), (312, 360)]
for x, y in dots:
    draw.ellipse([x-4, y-4, x+4, y+4], fill=(255, 255, 255, 180))

# PNG olarak kaydet
image.save('app_icon.png', 'PNG')
print("Icon başarıyla oluşturuldu: app_icon.png")
