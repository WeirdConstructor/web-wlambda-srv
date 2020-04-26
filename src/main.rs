// Copyright (c) 2019 Weird Constructor <weirdconstructor@gmail.com>
// This is a part of WeirdGoban. See README.md and COPYING for details.

extern crate hyper;
extern crate futures;
extern crate tokio_process;
extern crate tokio;
extern crate serde;
extern crate serde_json;

//use std::time::Duration;
//use futures::sync::mpsc;
use futures::future::lazy;
//use tokio::timer::Interval;
//use tokio::io;

use url::Url;
use hyper::{Body, Request, Response, Server, Method, StatusCode};
use hyper::rt::{Future, Stream};
use hyper::service::service_fn;
use hyper::header::{HeaderName, HeaderValue};
use futures::future;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::cell::RefCell;

//use std::process::Command;
//use tokio_process::CommandExt;

type BoxFut = Box<dyn Future<Item=Response<Body>, Error=hyper::Error> + Send>;

use wlambda;
use wlambda::{VVal, GlobalEnv};
use wlambda::rpc_helper::*;

struct WLContext {
    db_con: Option<sqlite::Connection>,
}

//use zmq::*;
//fn start_zmq() {
//    let ctx = zmq::Context::new();
//    let mut s = ctx.socket(zmq::SUB).unwrap();
//    println!("FOO\n");
//    s.connect("tcp://home.m8geil.de:8095").unwrap();
//    s.set_subscribe(b"").unwrap();
//    loop {
//        let r = s.recv_string(0).unwrap();
//        println!("OOO:{:?}", r);
//    }
//}

fn exec_sql_stmt(db: &mut sqlite::Connection, stmt_str: String, binds: &Vec<VVal>) -> VVal {
    let stmt = db.prepare(stmt_str.clone());
    if let Err(e) = stmt {
        return VVal::err_msg(
            &format!("SQL parse error '{}': {}", stmt_str, e));
    }
    let mut stmt = stmt.unwrap();

    for (i, b) in binds.iter().enumerate() {
        if b.is_float() {
            stmt.bind(i + 1, &sqlite::Value::Float(b.f())).unwrap();
        } else if b.is_int() {
            stmt.bind(i + 1, &sqlite::Value::Integer(b.i())).unwrap();
        } else if let VVal::Byt(u) = b {
            stmt.bind(i + 1, &sqlite::Value::Binary(u.as_ref().clone())).unwrap();
        } else if let VVal::None = b {
            stmt.bind(i + 1, &sqlite::Value::Null).unwrap();
        } else {
            stmt.bind(i + 1, &sqlite::Value::String(b.s_raw())).unwrap();
        }
    }

    let mut ret = VVal::None;
    loop {
        match stmt.next() {
            Err(e) => {
                return VVal::err_msg(
                    &format!("SQL exec error on '{}': {}", stmt_str, e));
            },
            Ok(sqlite::State::Row) => {
                if let VVal::None = ret {
                    ret = VVal::vec();
                };

                let row_vv = VVal::map();
                for i in 0..stmt.count() {
                    row_vv.set_key_str(
                        &stmt.name(i).to_string(),
                        match stmt.kind(i) {
                            sqlite::Type::Integer =>
                                VVal::Int(stmt.read::<i64>(i).unwrap()),
                            sqlite::Type::Float =>
                                VVal::Flt(stmt.read::<f64>(i).unwrap()),
                            sqlite::Type::Binary => {
                                VVal::new_byt(stmt.read::<Vec<u8>>(i).unwrap())
                            },
                            sqlite::Type::String => {
                                VVal::new_str_mv(stmt.read::<String>(i).unwrap())
                            },
                            sqlite::Type::Null => VVal::None,
                        }).expect("no double usage of row_vv");
                }

                ret.push(row_vv);
            },
            Ok(sqlite::State::Done) => {
                break;
            },
        };
    }

    ret
}

fn start_wlambda_thread() -> RPCHandle {
    let rpc_hdl = RPCHandle::new();

    let sender = rpc_hdl.clone();

    std::thread::spawn(move || {
        let genv = GlobalEnv::new_default();

        let files_path =
            Rc::new(RefCell::new(String::from("")));

        genv.borrow_mut().add_func(
            "db:connect_sqlite",
            |env: &mut wlambda::vval::Env, _argc: usize| {
                let open_str = env.arg(0).s_raw();
                env.with_user_do(|c: &mut WLContext| {
                    match sqlite::open(open_str.clone()) {
                        Ok(con) => {
                            c.db_con = Some(con);
                            Ok(VVal::Bol(true))
                        },
                        Err(e) => {
                            Ok(VVal::err_msg(
                                &format!("Couldn't open sqlite db '{}': {}", open_str, e)))
                        }
                    }
                })
            }, Some(1), Some(1));

        genv.borrow_mut().add_func(
            "text_diff",
            |env: &mut wlambda::vval::Env, _argc: usize| {
                use std::convert::TryFrom;
                let l = env.arg(0).s_raw();
                let r = env.arg(1).s_raw();

                let v = VVal::vec();

                let mut left_line_nr : usize = 1;
                for diff in diff::lines(&l, &r) {
                    match diff {
                        diff::Result::Left(l) => {
                            let ent = VVal::vec();
                            ent.push(VVal::Int(i64::try_from(left_line_nr).unwrap_or(-1)));
                            ent.push(VVal::Bol(false));
                            ent.push(VVal::new_str(l));
                            v.push(ent);
                            left_line_nr += 1;
                        },
                        diff::Result::Both(l, _) => {
                            let ent = VVal::vec();
                            ent.push(VVal::Int(i64::try_from(left_line_nr).unwrap_or(-1)));
                            ent.push(VVal::None);
                            ent.push(VVal::new_str(l));
                            v.push(ent);
                            left_line_nr += 1;
                        },
                        diff::Result::Right(l) => {
                            let ent = VVal::vec();
                            ent.push(VVal::Int(i64::try_from(left_line_nr).unwrap_or(-1)));
                            ent.push(VVal::Bol(true));
                            ent.push(VVal::new_str(l));
                            v.push(ent);
                        },
                    }
                }

                return Ok(v);
            }, Some(2), Some(2));

        let files_path1 = files_path.clone();
        genv.borrow_mut().add_func(
            "write_webdata",
            move |env: &mut wlambda::vval::Env, _argc: usize| {
                use std::io::prelude::*;
                let n = env.arg(0).s_raw();
                let d = env.arg(1);
                let filename = files_path1.borrow().clone() + "/" + &n;
                let f = std::fs::File::create(filename.clone());
                if let Err(e) = f {
                    return Ok(VVal::err_msg(
                        &format!("Couldn't open file {}: {}", filename, e)));
                };
                let mut f = f.unwrap();
                if let VVal::Byt(b) = d {
                    if let Err(e) = f.write_all(&b[..]) {
                        return Ok(VVal::err_msg(
                            &format!("Couldn't open file {}: {}", filename, e)));
                    }
                }
                return Ok(VVal::Bol(true));
            }, Some(2), Some(2));

        let files_path2 = files_path.clone();
        genv.borrow_mut().add_func(
            "make_webdata_thumbnail",
            move |env: &mut wlambda::vval::Env, _argc: usize| {
                let fp = files_path2.borrow().clone();
                let n     = fp.clone() + &env.arg(0).s_raw();
                let n_out = fp         + &env.arg(1).s_raw();

                let mut convert = std::process::Command::new("convert");
                if let Err(e) =
                    convert.arg("-resize").arg("200x100")
                           .arg("-auto-orient")
                           .arg(n.to_string()).arg(n_out).output() {
                    return Ok(VVal::err_msg(
                        &format!("Couldn't resize image {}: {}", n, e)));
                }

                return Ok(VVal::Bol(true));
            }, Some(2), Some(2));

        let files_path3 = files_path.clone();
        genv.borrow_mut().add_func(
            "append_webdata",
            move |env: &mut wlambda::vval::Env, _argc: usize| {
                use std::fs::OpenOptions;
                use std::io::prelude::*;
                let n = env.arg(0).s_raw();
                let d = env.arg(1);

                let filepath = files_path3.borrow().clone() + &n;
                let f = OpenOptions::new()
                    .write(true)
                    .append(true)
                    .open(filepath.clone());
                if let Err(e) = f {
                    return Ok(VVal::err_msg(
                        &format!("Couldn't open file {}: {}", filepath, e)));
                };
                let mut f = f.unwrap();
                if let VVal::Byt(b) = d {
                    println!("appended {}: bytes {}", filepath, b.len());
                    if let Err(e) = f.write_all(&b[..]) {
                        return Ok(VVal::err_msg(
                            &format!("Couldn't open file {}: {}", filepath, e)));
                    }
                }
                return Ok(VVal::Bol(true));
            }, Some(2), Some(2));

        genv.borrow_mut().add_func(
            "b64:decode",
            |env: &mut wlambda::vval::Env, _argc: usize| {
                use base64::decode;
                Ok(match decode(&env.arg(0).s_raw()) {
                    Ok(v)  => VVal::new_byt(v),
                    Err(e) => VVal::err_msg(&format!("Decode base64 error: {}", e)),
                })
            }, Some(1), Some(1));

        genv.borrow_mut().add_func(
            "db:exec",
            |env: &mut wlambda::vval::Env, argc: usize| {
                let stmt_str = env.arg(0).s_raw();
                let binds =
                    if env.arg(1).is_vec() {
                        env.arg(1).to_vec()
                    } else {
                        let mut binds = vec![];
                        for i in 1..argc {
                            binds.push(env.arg(i).clone())
                        }
                        binds
                    };

                env.with_user_do(|c: &mut WLContext| {
                    if let Some(ref mut db) = c.db_con {
                        Ok(exec_sql_stmt(db, stmt_str.clone(), &binds))
                    } else {
                        Ok(VVal::err_msg("no db connection"))
                    }
                })
            }, Some(1), None);

        let mut wl_eval_ctx =
            wlambda::compiler::EvalContext::new_with_user(
                genv,
                Rc::new(RefCell::new(WLContext { db_con: None })));

        match wl_eval_ctx.eval_file("main.wl") {
            Ok(v) => {
                if v.is_err() {
                    panic!(format!("'main.wl' SCRIPT ERROR: {}", v.s()));
                }
            },
            Err(e) => { panic!(format!("'main.wl' SCRIPT ERROR: {}", e)); }
        }

        let r = wl_eval_ctx.eval("file_path").unwrap();
        if r.is_none() {
            *files_path.borrow_mut() = String::from("webdata");
        } else {
            *files_path.borrow_mut() = wl_eval_ctx.call(&r, &vec![]).unwrap().s_raw();
        }

        rpc_handler(
            &mut wl_eval_ctx, &rpc_hdl, std::time::Duration::from_millis(500));
    });

    sender
}

#[allow(dead_code)]
fn mime_for_ext(s: &str) -> String {
    String::from(
        match &s.to_lowercase()[..] {
            "css"   => "text/css",
            "js"    => "text/javascript",
            "png"   => "image/png",
            "jpg"   => "image/jpeg",
            "jpeg"  => "image/jpeg",
            "gif"   => "image/gif",
            "json"  => "application/json",
            "html"  => "text/html",
            "wasm"  => "application/wasm",
            _       => "text/plain",
        }
    )
}

fn parse_basic_auth(header: &str) -> VVal {
    use base64::decode;
    let mut i = header.split_ascii_whitespace();
    let m : String = String::from(i.next().unwrap_or(""));
    let b : String = String::from(i.next().unwrap_or(""));

    if m != "Basic" || b.is_empty() {
        VVal::None
    } else {
        let v = VVal::vec();
        v.push(VVal::new_str_mv(m));
        v.push(VVal::new_str_mv(
            String::from_utf8(decode(&b).unwrap())
            .unwrap_or(String::from(""))));
        v
    }
}

#[allow(dead_code)]
fn webmain(req: Request<Body>, snd: RPCHandle) -> BoxFut {

    let gr_snd = snd.clone();
    let get_response = move |method: String, path: String, data: VVal, url: String| {
        let v = VVal::vec();
        v.push(VVal::new_str_mv(method));
        v.push(VVal::new_str_mv(path));
        v.push(data);

        if let Ok(url_obj) = Url::parse(&url) {
            let qp = VVal::map();
            for (key, value) in url_obj.query_pairs() {
                qp.set_key_str(&key, VVal::new_str_mv(value.to_string()))
                  .expect("no double usage of qp");
            }

            v.push(VVal::new_str_mv(url));
            v.push(qp);
        } else {
            v.push(VVal::new_str_mv(url));
            v.push(VVal::None);
        }

        gr_snd.call("req", v)
    };

    let apply_response = |wl_resp: VVal, resp: &mut hyper::Response<hyper::Body>| {
        if wl_resp.is_map() {
            if let Some(status) = wl_resp.get_key("status") {
                *resp.status_mut() = StatusCode::from_u16(status.i() as u16).unwrap();
            }
            if let Some(ct) = wl_resp.get_key("content_type") {
                (*resp.headers_mut()).insert(
                    HeaderName::from_static("content-type"),
                    HeaderValue::from_str(&ct.s()).unwrap());
            }
            if let Some(data) = wl_resp.get_key("data") {
                (*resp.headers_mut()).insert(
                    HeaderName::from_static("content-type"),
                    HeaderValue::from_str("application/json").unwrap());
                *resp.body_mut() =
                    Body::from(data.to_json(true).unwrap());
            } else {
                *resp.body_mut() =
                    Body::from(
                        wl_resp.get_key("body").unwrap_or(VVal::None).s_raw());
            }

        } else if wl_resp.is_err() {
            eprintln!("ERROR RESPONSE: {}", wl_resp.s_raw());
            *resp.status_mut() = StatusCode::from_u16(500).unwrap();
            (*resp.headers_mut()).insert(
                HeaderName::from_static("content-type"),
                HeaderValue::from_str("text/plain").unwrap());
            *resp.body_mut() = Body::from(wl_resp.s_raw());

        } else {
            (*resp.headers_mut()).insert(
                HeaderName::from_static("content-type"),
                HeaderValue::from_str("application/json").unwrap());
            *resp.body_mut() =
                Body::from(wl_resp.to_json(true).unwrap());
        }
    };

    let mut response = Response::new(Body::empty());

    let uri = req.uri().to_string();
    let method : hyper::Method = req.method().clone();
    let path = String::from(req.uri().path());
    let path = percent_encoding::percent_decode_str(&path).decode_utf8_lossy().to_string();
    let p : &str = &path;

    let authenticated =
        if let Some(head_val) = req.headers().get(hyper::header::AUTHORIZATION) {
            let v = VVal::vec();
            v.push(VVal::new_str_mv(format!("{:?}", method)));
            v.push(VVal::new_str_mv(String::from(&path)));
            v.push(parse_basic_auth(head_val.to_str().unwrap_or("")));
            let r = snd.call("auth", v);
            r.b()
        } else {
            let v = VVal::vec();
            v.push(VVal::new_str_mv(format!("{:?}", method)));
            v.push(VVal::new_str_mv(String::from(&path)));
            let need_auth = snd.call("need_auth", v).b();
            !need_auth
        };

    if !authenticated {
        let r = snd.call("auth_realm", VVal::None);
        *response.status_mut() = StatusCode::UNAUTHORIZED;
        (*response.headers_mut()).insert(
            HeaderName::from_static("www-authenticate"),
            HeaderValue::from_str(
                &format!("Basic realm=\"{}\"", r.s_raw())).unwrap());
        return Box::new(future::ok(response));
    }

    println!("* {:?} {}", method, path);
    match (&method, p) {
        (&Method::GET, path) => {
            let spath = String::from(path);
            let path = Path::new(path);

            let v = VVal::vec();
            v.push(VVal::new_str_mv(format!("{:?}", method)));
            v.push(VVal::new_str_mv(spath.to_string()));
            let r = snd.call("file_prefix", v);
            let prefix_sl = r.s_raw() + "/";
            let prefix = r.s_raw();

            let r = snd.call("file_path", VVal::None);
            let files_path =
                if r.is_none() {
                    String::from("webdata")
                } else {
                    r.s_raw()
                };

            if path.starts_with(&prefix_sl) {
                let webdata_path = match path.strip_prefix(&prefix) {
                    Ok(p) => p,
                    _ => {
                        *response.status_mut() = StatusCode::NOT_FOUND;
                        return Box::new(future::ok(response));
                    }
                };

                let mut p = PathBuf::from(files_path + "/");
                p.push(webdata_path);

                println!("GET PATH: {:?}", &p);
                let as_path = p;
                if as_path.is_file() {
                    let text = vec![std::fs::read(&as_path).unwrap()];

                    if let Some(extension) = as_path.extension() {
                        let mime = mime_for_ext(extension.to_str().unwrap());
                        println!("MIME {:?} => {}", as_path, mime);
                        (*response.headers_mut()).insert(
                            HeaderName::from_static("content-type"),
                            HeaderValue::from_str(&mime).unwrap());
                    } else {
                        eprintln!("Content type unset for {:?}", as_path);
                    }

                    *response.body_mut() =
                        Body::wrap_stream(futures::stream::iter_ok::<_, ::std::io::Error>(text));
                } else {
                    *response.status_mut() = StatusCode::NOT_FOUND;
                }
            } else {
                apply_response(
                    get_response(format!("{:?}", method), spath, VVal::None, uri),
                    &mut response);
            }
        },
        (_, path) => {
            let spath = String::from(path);
            let res = req.into_body().concat2().map(move |chunk| {
                let body : Vec<u8> = chunk.iter().cloned().collect();
                match String::from_utf8(body) {
                    Ok(b) => {
                        match serde_json::from_str::<VVal>(&b) {
                            Ok(v) => {
                                apply_response(
                                    get_response(format!("{:?}", method), spath, v, uri),
                                    &mut response);
                            },
                            Err(_) => {
                                *response.status_mut() = StatusCode::BAD_REQUEST;
                            },
                        }
                    },
                    _ => {
                        *response.status_mut() = StatusCode::BAD_REQUEST;
                    },
                };
                response
            });

            return Box::new(res);
        },
    };

    Box::new(future::ok(response))
}

#[allow(dead_code)]
fn start_server() {
    let sender = start_wlambda_thread();

    let sa : std::net::SocketAddr =
        sender.call("local_endpoint", VVal::None).s_raw()
            .parse().unwrap_or(
                "127.0.0.1:19099".parse().unwrap());
    let addr = sa.into();

    let server = Server::bind(&addr)
        .serve(move || {
            let sender2 = sender.clone();
            service_fn(move |req: Request<Body>| webmain(req, sender2.clone()))
        })
        .map_err(|e| eprintln!("server error: {}", e));

    hyper::rt::run(lazy(|| {
        tokio::spawn(server);
        Ok(())
    }));
}

fn main() {
//    start_zmq();
    start_server();
}
