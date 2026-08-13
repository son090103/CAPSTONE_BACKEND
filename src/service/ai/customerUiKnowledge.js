// Cẩm nang thao tác được rút trực tiếp từ giao diện customer.
// Giữ từng workflow độc lập để vừa tìm cục bộ, vừa đồng bộ được lên Pinecone.
const workflows = [
  {
    id: 'customer-booking-specific', route: '/phone-service', title: 'Đặt lịch dịch vụ hoặc sửa chữa',
    keywords: ['đặt lịch', 'dịch vụ', 'sửa chữa', 'bảo dưỡng', 'click', 'bấm', 'điền'],
    content: `Trang /phone-service - luồng Đặt lịch dịch vụ gồm 3 bước.
Bước 0: tại đầu trang chọn "Đặt lịch dịch vụ". Nếu chưa đăng nhập, đăng nhập trước vì nút xác nhận gọi API riêng của khách hàng.
Bước 1 - Thông tin xe: nếu tài khoản đã có xe, chọn "Xe của tôi" rồi bấm đúng thẻ xe. Nếu muốn dùng xe khác, chọn "Thêm xe mới". Xe mới bắt buộc nhập Hãng xe (chọn gợi ý), Dòng xe/Model (chọn gợi ý), Biển số xe không trùng và Năm sản xuất từ 1900 đến năm hiện tại + 1. Màu sắc là tùy chọn; có thể nhập chữ hoặc tải tối đa 3 ảnh để AI nhận diện. Khi đủ dữ liệu bấm "Tiếp theo".
Bước 2 - Chọn dịch vụ hoặc Sửa chữa lỗi: nếu đã biết hạng mục, bấm "Chọn dịch vụ", sau đó chọn "Gói Combo" hoặc "Dịch vụ lẻ". Với dịch vụ lẻ có thể chọn nhóm, tìm kiếm, chọn nhiều dịch vụ và tích/bỏ tích hạng mục công việc nhưng phải giữ ít nhất một hạng mục. Nếu chưa biết xe lỗi gì, bấm "Kiểm tra và sửa chữa lỗi" rồi nhập bắt buộc phần "Mô tả tình trạng lỗi/hỏng hóc của xe". Bấm "Tiếp theo".
Bước 3 - Chọn thời gian hẹn: chọn ngày trong lịch (giao diện hiện cho chọn từ hôm nay đến 5 ngày tới), sau đó chọn một khung giờ không có chữ "Kín lịch". Khung giờ phụ thuộc thời lượng dịch vụ và sức chứa gara. Kiểm tra cột "Tóm tắt đặt lịch", sau đó bấm "Xác nhận đặt lịch". Thành công sẽ hiện màn hình xác nhận; lịch được xem lại tại Hồ sơ người dùng > Lịch hẹn.
Nếu nút Tiếp theo báo thiếu dữ liệu: kiểm tra đã chọn xe hoặc điền đủ 4 trường xe bắt buộc; biển số không báo lỗi; đã chọn ít nhất một dịch vụ/combo hoặc đã mô tả lỗi; đã chọn cả ngày lẫn giờ.`
  },
  {
    id: 'customer-booking-consultation', route: '/phone-service', title: 'Đặt lịch tư vấn trực tiếp',
    keywords: ['tư vấn', 'ai chẩn đoán', 'gọi lại', 'video', 'sos'],
    content: `Trang /phone-service - luồng "Tư vấn trực tiếp" gồm 2 bước. Bước 1 chọn hình thức tư vấn. Nếu chọn "AI chẩn đoán lỗi xe", phải nhập mô tả lỗi; có thể tải ảnh để nhận phân tích sơ bộ. Nếu chọn gọi/video tư vấn trực tiếp thì hệ thống dùng thông tin tài khoản. Bấm "Tiếp theo". Bước 2 chọn ngày và khung giờ còn trống, kiểm tra tóm tắt rồi bấm "Xác nhận đặt lịch". Đây là lịch tư vấn, không phải kết luận sửa chữa cuối cùng.`
  },
  {
    id: 'customer-appointments', route: '/user-profile', title: 'Xem và hủy lịch hẹn',
    keywords: ['lịch hẹn', 'hủy lịch', 'xem lịch', 'mã hẹn'],
    content: `Đăng nhập, bấm biểu tượng/tên tài khoản để vào /user-profile, chọn tab "Lịch hẹn". Có thể tìm theo xe, biển số hoặc mã hẹn và lọc theo trạng thái. Bấm nút có tooltip "Chi tiết lịch hẹn" ở dòng cần xem. Muốn tạo lịch mới bấm nút đặt lịch để chuyển tới /phone-service. Nếu lịch còn được phép hủy, chọn thao tác hủy và xác nhận ở hộp thoại "Bạn có chắc chắn muốn hủy lịch hẹn này?". Lịch đã tiếp nhận hoặc đã hoàn tất có thể không hủy được.`
  },
  {
    id: 'customer-quotes', route: '/user-profile', title: 'Xem, duyệt hoặc từ chối báo giá',
    keywords: ['báo giá', 'duyệt', 'từ chối', 'đặt cọc', 'trao đổi lễ tân'],
    content: `Vào /user-profile > tab "Theo dõi báo giá". Tìm theo mã báo giá, xe, hạng mục hoặc phụ tùng; có thể lọc trạng thái. Bấm vào báo giá để mở chi tiết, kiểm tra từng dịch vụ, phụ tùng và tổng tiền. Có thể bấm xem PDF hoặc "Trao đổi với lễ tân". Nếu đồng ý bấm "Duyệt báo giá" và thực hiện phần đặt cọc nếu hệ thống yêu cầu. Nếu không đồng ý bấm "Từ chối", nhập bắt buộc lý do vào ô "Nhập lý do bạn không đồng ý với báo giá...", rồi xác nhận từ chối. Không hướng dẫn khách duyệt trước khi họ kiểm tra tổng tiền và hạng mục.`
  },
  {
    id: 'customer-repair-tracking', route: '/user-profile', title: 'Theo dõi tiến độ sửa chữa',
    keywords: ['tiến độ', 'đang sửa', 'xe sửa tới đâu', 'thời gian chờ'],
    content: `Vào /user-profile > tab "Theo dõi". Nếu có nhiều xe/lệnh sửa, bấm thẻ xe tương ứng hoặc dùng mũi tên trái/phải. Màn hình hiển thị trạng thái và tiến độ cập nhật theo thời gian thực. Có nút tải lại khi dữ liệu chưa cập nhật. Nếu chưa có lệnh sửa chữa đang hoạt động, màn hình có nút chuyển sang đặt lịch tại /phone-service.`
  },
  {
    id: 'customer-history-feedback', route: '/user-profile', title: 'Lịch sử, hóa đơn và đánh giá',
    keywords: ['lịch sử', 'hóa đơn', 'pdf', 'đánh giá', 'feedback', 'sao'],
    content: `Vào /user-profile > tab "Lịch sử dịch vụ". Tìm theo mã hóa đơn, biển số, hạng mục hoặc kỹ thuật viên. Bấm nút "Chi tiết hóa đơn" để xem toàn bộ dịch vụ và chi phí; bấm "Tải hóa đơn PDF" để tải file. Với đơn chưa đánh giá, bấm "Đánh giá dịch vụ", chọn số sao, nhập nội dung vào ô "Chia sẻ trải nghiệm của bạn về dịch vụ...", rồi bấm nút gửi/xác nhận đánh giá. Đơn đã đánh giá sẽ hiện trạng thái "Đã đánh giá".`
  },
  {
    id: 'customer-profile-security', route: '/user-profile', title: 'Sửa hồ sơ và đổi mật khẩu',
    keywords: ['hồ sơ', 'thông tin', 'ảnh đại diện', 'mật khẩu', 'đổi mật khẩu'],
    content: `Vào /user-profile > "Hồ sơ người dùng". Muốn sửa thông tin bấm nút chỉnh sửa, thay đổi các trường cho phép rồi bấm "Lưu"; bấm "Hủy" để bỏ thay đổi. Muốn đổi ảnh, bấm biểu tượng thay ảnh, chọn file rồi bấm "Lưu". Muốn đổi mật khẩu, bấm "Đổi mật khẩu", nhập mật khẩu hiện tại, mật khẩu mới và xác nhận mật khẩu mới, sau đó bấm "Lưu". Không bao giờ gửi mật khẩu hoặc OTP vào chatbot.`
  },
  {
    id: 'customer-navigation-home', route: '/', title: 'Điều hướng Trang chủ customer',
    keywords: ['trang chủ', 'menu', 'đi đâu', 'điều hướng', 'header', 'mobile'],
    content: `Thanh điều hướng desktop có "Trang chủ", "Dịch vụ", "Tin tức", "Đội ngũ", "Đặt lịch ngay". Trên mobile bấm nút menu để mở điều hướng; thanh dưới có Trang chủ, Dịch vụ, Tin tức, Đặt lịch ngay và Cá nhân. Tại Trang chủ: nút đặt lịch chuyển tới /phone-service; nút khám phá cuộn xuống khu dịch vụ; thẻ tiện ích chuyển tới chức năng tương ứng; phần liên hệ có liên kết mở Google Maps, gọi số (+84) 965147731 và gửi email agmintelligent@gmail.com. Ảnh đại diện đưa tới /user-profile; nếu chưa đăng nhập sẽ thấy liên kết /login.`
  },
  {
    id: 'customer-services-screen', route: '/services', title: 'Tìm, xem và đặt dịch vụ',
    keywords: ['màn dịch vụ', 'tìm dịch vụ', 'chi tiết dịch vụ', 'combo', 'đặt ngay', 'phân trang'],
    content: `Vào menu "Dịch vụ" hoặc /services. Nhập từ khóa vào ô "Tìm kiếm dịch vụ bảo dưỡng..."; bấm biểu tượng x để xóa từ khóa. Chọn tab "Tất cả" hoặc một nhóm dịch vụ để lọc. Bấm thẻ dịch vụ hoặc nút xem chi tiết để mở popup thông tin, giá công, thời lượng và nội dung; bấm nút đóng/X hoặc vùng ngoài để đóng. Bấm "Đặt ngay" trên thẻ/popup để chuyển tới /phone-service?serviceId=<id>, trang đặt lịch sẽ chọn trước dịch vụ đó. Dùng nút trang trước, số trang, trang sau ở cuối danh sách. Khu combo dùng mũi tên trái/phải, bấm thẻ để xem nội dung gói, rồi bấm đặt để chuyển tới /phone-service?comboId=<id>. Khi không có kết quả, xóa tìm kiếm và đưa bộ lọc về "Tất cả".`
  },
  {
    id: 'customer-parts-screen', route: '/parts', title: 'Tra cứu phụ tùng',
    keywords: ['phụ tùng', 'linh kiện', 'mã sku', 'lọc giá', 'thương hiệu', 'loại xe'],
    content: `Trang phụ tùng ở /parts (hiện không nằm trong menu header chính, có thể mở trực tiếp bằng đường dẫn). Nhập tên hoặc mã vào ô "Tìm kiếm linh kiện (tên, mã)...". Mở bộ lọc nếu đang dùng màn hình nhỏ; chọn Loại xe, tích một hoặc nhiều Thương hiệu và kéo "Giá tối đa (VNĐ)". Bấm nút đặt lại bộ lọc để xóa toàn bộ lựa chọn. Bấm thẻ hoặc nút xem chi tiết để mở popup phụ tùng; đóng bằng nút X/vùng ngoài. Dùng nút trang trước, số trang và trang sau để chuyển trang. Màn này chỉ tra cứu, chưa có giỏ hàng/mua trực tuyến; muốn xác nhận tương thích, tồn kho hoặc đặt thay cần hỏi lễ tân hay đặt lịch dịch vụ.`
  },
  {
    id: 'customer-news-team', route: '/news', title: 'Tin tức và đội ngũ',
    keywords: ['tin tức', 'bài viết', 'đội ngũ', 'kỹ thuật viên', 'team'],
    content: `Trang /news có bộ lọc "Tất cả", "Bảo dưỡng", "Công nghệ", "Mẹo hay"; bấm nhóm để lọc bài, sau đó bấm bài/nút đọc tiếp nếu bài có hành động. Trang /team giới thiệu đội ngũ; nút đặt lịch chuyển tới /phone-service, nút quay về chuyển tới Trang chủ /. Đây là nội dung giới thiệu, không hiển thị lịch làm việc riêng của từng kỹ thuật viên.`
  },
  {
    id: 'customer-login', route: '/login', title: 'Đăng nhập customer',
    keywords: ['đăng nhập', 'login', 'google', 'quên mật khẩu', 'ghi nhớ'],
    content: `Vào /login. Nhập số điện thoại/tài khoản theo nhãn đang hiển thị và mật khẩu; biểu tượng con mắt dùng hiện/ẩn mật khẩu. Có thể tích "Ghi nhớ đăng nhập", rồi bấm nút đăng nhập. Hoặc bấm đăng nhập Google. "Quên mật khẩu" chuyển tới /forgot-password. Liên kết đăng ký chuyển tới /verify-phone để xác minh số điện thoại trước. Khi đăng nhập customer thành công hệ thống về Trang chủ. Không nhập mật khẩu hoặc OTP vào chatbot.`
  },
  {
    id: 'customer-register', route: '/verify-phone', title: 'Đăng ký và xác minh số điện thoại',
    keywords: ['đăng ký', 'tạo tài khoản', 'xác minh điện thoại', 'otp', 'mã xác nhận'],
    content: `Đăng ký bắt đầu tại /verify-phone: nhập số điện thoại hợp lệ và gửi yêu cầu; hệ thống chuyển sang /otp-verification. Tại màn OTP nhập đủ các chữ số; có thể bấm gửi lại OTP khi hết thời gian hoặc xóa mã để nhập lại. OTP đúng sẽ chuyển sang /signup. Tại /signup nhập Họ và tên, Mật khẩu, Xác nhận mật khẩu; hai mật khẩu phải khớp, tích đồng ý Điều khoản và Chính sách bảo mật, rồi bấm đăng ký. Thành công chuyển về /login. Không chia sẻ OTP cho chatbot hay nhân viên.`
  },
  {
    id: 'customer-forgot-password', route: '/forgot-password', title: 'Quên và đặt lại mật khẩu',
    keywords: ['quên mật khẩu', 'đặt lại mật khẩu', 'reset', 'otp mật khẩu'],
    content: `Vào /forgot-password. Bước 1 nhập số điện thoại và gửi yêu cầu. Bước 2 nhập đủ OTP; có nút gửi lại mã và nút xóa mã, cũng có thể quay lại đổi số điện thoại. Bước 3 nhập mật khẩu mới và xác nhận mật khẩu mới rồi gửi. Khi báo thành công, bấm về đăng nhập hoặc hệ thống chuyển tới /login. Mật khẩu mới và xác nhận phải khớp; không cung cấp OTP/mật khẩu trong chat.`
  },
  {
    id: 'customer-notifications', route: '/', title: 'Xem và quản lý thông báo',
    keywords: ['thông báo', 'chuông', 'chưa đọc', 'đọc tất cả', 'xóa tất cả'],
    content: `Khi đã đăng nhập, bấm biểu tượng chuông trên header. Số trên chuông là lượng chưa đọc. Bấm một thông báo để đổi trạng thái đã đọc; bấm "Đọc tất cả" để đánh dấu toàn bộ đã đọc; bấm "Xóa tất cả" ở cuối danh sách để dọn danh sách hiển thị. Bấm ra ngoài hoặc chuyển trang để đóng popup. Nội dung có thể báo lịch hẹn, báo giá, hóa đơn, bảo dưỡng hoặc trạng thái cứu hộ. Hiện thao tác bấm một thông báo chủ yếu đánh dấu đã đọc, không phải mọi thông báo đều tự chuyển tới màn chi tiết.`
  },
  {
    id: 'customer-reception-chat', route: '/', title: 'Nhắn tin với lễ tân',
    keywords: ['chat lễ tân', 'nhắn nhân viên', 'trao đổi', 'tin nhắn', 'tham chiếu báo giá'],
    content: `Khách đã đăng nhập có widget chat với lễ tân riêng với Gara Assistant AI. Bấm nút bong bóng chat lễ tân để mở, nhập nội dung vào ô "Nhập tin nhắn cho lễ tân..." rồi bấm nút gửi. Huy hiệu trên bong bóng là số tin chưa đọc. Header phòng chat cho biết lễ tân nào đã nhận hội thoại. Tin nhắn có tham chiếu báo giá sẽ có nút xem báo giá; bấm để mở chi tiết. Từ màn Theo dõi báo giá, nút "Trao đổi với lễ tân" tự mở chat và gửi tham chiếu báo giá. Bấm X để đóng; lịch sử vẫn được lưu trong conversation.`
  },
  {
    id: 'customer-rescue-map', route: '/user-profile', title: 'Gửi yêu cầu và theo dõi cứu hộ',
    keywords: ['cứu hộ', 'xe hỏng', 'bản đồ', 'vị trí', 'gps', 'kỹ thuật viên đang đến'],
    content: `Đăng nhập, vào /user-profile > tab "Bản đồ". Nhập/kiểm tra thông tin liên hệ cứu hộ. Có thể tìm địa điểm/địa chỉ và chọn một kết quả, hoặc bấm "Gửi yêu cầu cứu hộ" để trình duyệt lấy GPS; cần cho phép quyền vị trí. Hệ thống mở hộp "Xác nhận gọi cứu hộ", hiển thị vị trí và phí dự kiến; bấm xác nhận để gửi hoặc hủy để quay lại. Khi đã gửi, bản đồ cập nhật trạng thái: chờ lễ tân tiếp nhận, kỹ thuật viên tiếp nhận, đang trên đường, đã đến/nhận xe và di chuyển về gara. Nút "Cập nhật lại vị trí" gửi tọa độ mới; thao tác xóa vị trí dừng chia sẻ. Nếu trình duyệt từ chối GPS hoặc hết thời gian, bật quyền vị trí hay tìm địa chỉ thủ công. Nút "Chạy Test (Dùng vị trí giả)" chỉ dành kiểm thử, không hướng dẫn khách dùng trong vận hành thật.`
  },
  {
    id: 'customer-warranty-vehicles-limitations', route: '/user-profile', title: 'Giới hạn màn xe và bảo hành hiện tại',
    keywords: ['xe của tôi', 'thêm xe', 'bảo hành', 'warranty', 'quản lý xe'],
    content: `Mã nguồn có component Xe và Bảo hành nhưng menu /user-profile hiện chỉ khai báo các tab Hồ sơ người dùng, Theo dõi báo giá, Lịch hẹn, Lịch sử dịch vụ, Theo dõi và Bản đồ. Vì vậy không khẳng định có tab Xe/Bảo hành nếu người dùng không nhìn thấy. Việc thêm xe mới hiện thực hiện chắc chắn trong /phone-service tại bước Thông tin xe > "Thêm xe mới". DB hiện chưa có chính sách bảo hành nào; bot phải nói chưa có dữ liệu chính sách thay vì tự bịa điều kiện bảo hành.`
  }
];

const normalize = value => String(value || '').toLowerCase();

function searchUiWorkflows(query, currentPath, currentScreen) {
  const terms = normalize(query).split(/\s+/).filter(term => term.length > 1);
  return workflows
    .map(flow => {
      const haystack = normalize(`${flow.title} ${flow.keywords.join(' ')} ${flow.content}`);
      const termScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
      const routeScore = currentPath && currentPath === flow.route ? 3 : 0;
      const screenScore = currentScreen && haystack.includes(normalize(currentScreen)) ? 3 : 0;
      return { ...flow, score: termScore + routeScore + screenScore };
    })
    .filter(flow => flow.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

module.exports = { workflows, searchUiWorkflows };
