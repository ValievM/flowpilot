#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <node_api.h>
#include <sys/param.h>
#include <unistd.h>

namespace {

napi_value fail(napi_env env, const char* message) {
  napi_throw_type_error(env, nullptr, message);
  return nullptr;
}

napi_value open_at(napi_env env, napi_callback_info info) {
  size_t argument_count = 4;
  napi_value arguments[4];
  if (napi_get_cb_info(env, info, &argument_count, arguments, nullptr, nullptr) !=
      napi_ok) {
    return fail(env, "Invalid openat arguments");
  }
  if (argument_count < 3 || argument_count > 4) {
    return fail(env, "openAt requires a directory descriptor, name, flags, and optional mode");
  }

  int32_t directory_fd = -1;
  int32_t flags = 0;
  int32_t mode = 0;
  if (napi_get_value_int32(env, arguments[0], &directory_fd) != napi_ok ||
      napi_get_value_int32(env, arguments[2], &flags) != napi_ok) {
    return fail(env, "openAt numeric arguments must be integers");
  }
  if (argument_count == 4) {
    napi_valuetype mode_type;
    if (napi_typeof(env, arguments[3], &mode_type) != napi_ok ||
        (mode_type != napi_undefined &&
         napi_get_value_int32(env, arguments[3], &mode) != napi_ok)) {
      return fail(env, "openAt mode must be an integer");
    }
  }

  size_t name_length = 0;
  if (napi_get_value_string_utf8(env, arguments[1], nullptr, 0, &name_length) !=
      napi_ok) {
    return fail(env, "openAt name must be a string");
  }
  if (name_length == 0 || name_length > NAME_MAX) {
    return fail(env, "openAt name must be one safe path component");
  }

  char name[NAME_MAX + 1];
  size_t copied_length = 0;
  if (napi_get_value_string_utf8(env, arguments[1], name, sizeof(name),
                                 &copied_length) != napi_ok ||
      copied_length != name_length) {
    return fail(env, "openAt name must be a string");
  }
  if (std::memchr(name, '/', name_length) != nullptr ||
      std::memchr(name, '\0', name_length) != nullptr ||
      (name_length == 1 && name[0] == '.') ||
      (name_length == 2 && name[0] == '.' && name[1] == '.')) {
    return fail(env, "openAt name must be one safe path component");
  }

  const int descriptor = openat(directory_fd, name, flags, mode);
  if (descriptor < 0) {
    const int error_number = errno;
    napi_throw_error(env, nullptr, std::strerror(error_number));
    return nullptr;
  }
  napi_value result;
  if (napi_create_int32(env, descriptor, &result) != napi_ok) {
    close(descriptor);
    return fail(env, "Could not create the openAt result");
  }
  return result;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_value method;
  if (napi_create_function(env, "openAt", NAPI_AUTO_LENGTH, open_at, nullptr,
                           &method) != napi_ok ||
      napi_set_named_property(env, exports, "openAt", method) != napi_ok) {
    return fail(env, "Could not register openAt");
  }
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
