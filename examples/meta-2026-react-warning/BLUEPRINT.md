# Blueprint kich ban - Meta 2026 - thuat toan khai tu video reaction xao nau

> Video doc 9:16 - toi da ~60 giay - TTS OmniVoice tieng Viet - Renderer: HyperFrames
> Script chay duoc: npm run pipeline -- examples/meta-2026-react-warning/script.json

## 1. Chi dao nghe thuat - noi dung nguyen ban theo chinh sach Meta 2026

- Mot insight duy nhat, mot loi hua duy nhat: kich ban chi khai thac dung mot luan diem - video reaction xao nau sap bi khai tu; cach song sot la tao gia tri moi. Khong them luan diem phu, khong them so lieu gay nhieu.
- Khong xao nau noi dung nguoi khac: khong cat ghep clip la, khong phan ung co mat, khong tom tat kenh khac. Moi canh deu la nhan dinh goc + khung nhin moi - goc canh bao + loi thoat - cua chinh kich ban nay.
- Hinh anh template: dung template toi gian, du lieu lon - glitch/stat/list/vignelli/statement-outro - chu KHONG dung layout reaction hay man hinh ghep clip xao nau. Thi giac = poster bien tap.



## 2. Bang phan vai - tung phan doan

| # | Phan doan | Thoi luong | Nhiem vu | Template | Nhip cam xuc |
|---|---|---|---|---|---|
| 1 | Hook bat dinh | ~11-12s | Dap niem tin cu: ngoi nhin + gat gu = trieu view, roi dao nguoc bang: Meta 2026 doi luat choi | frame-glitch-title | Soc, bao dong |
| 2 | Luat moi | ~9s | Neu chuan moi: ghep clip + bieu cam = khong nguyen ban, AI se gan nhan | frame-pentagram-stat | Nghiem trang, canh bao |
| 3 | Hau qua + loi thoat | ~13s |3 hau qua: bot tiep can, tat kiem tien +2 loi thoat: phan tich moi, xuat hien truc dien, nang cap cot | frame-aicoding-list | Bot nghet, roi he loi thoat |
| 4 | Luat sinh ton | ~8s | Chot triet ly: dung thanh cai bong cua nguoi khac | frame-vignelli | Tinh lang, dut khoat |
| 5 | Outro CTA | ~8-11s | Keu goi chia se de cuu kenh ban be | frame-statement-outro | Am ap, hanh dong |

Script goc chay duoc: script.json - 5 scenes, tong audio ~50.5s / video ~53.7s (da chay pipeline thanh cong)..


Muon ban phat hanh khop 55-60 giay: giu nguyen script.json, tang MOCK_TTS_RATE len khoang 3-5%, hoac doc cham hon 5% bang OmniVoice that.
> Giong mock TTS de demo pipeline: chay scripts/mock-tts-server-dynamic-new.py, chinh MOCK_TTS_RATE de dung ~60s. Thay bang OmniVoice that qua OMNIVOICE_ENDPOINT khi san sang.

> Ky thuat an toan: noi dung file BLUEPRINT nay viet bang ASCII khong dau de tranh loi ma hoa trong tooling. Ban co the kham khao cau truc va thay the noi dung bang tieng Viet co dau binh thuong khi chinh sua. Kich ban day du 5 scene cua meta-2026-react-warning da duoc render thanh cong - video ~53.7s - tai examples/meta-2026-react-warning/video.mp4
