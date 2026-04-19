export const validateLogin = (data) => {
  const { email, password } = data;
  
  if (!email || !password) {
    return { isValid: false, message: 'Email và mật khẩu là bắt buộc' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: 'Định dạng email không hợp lệ' };
  }

  return { isValid: true };
};