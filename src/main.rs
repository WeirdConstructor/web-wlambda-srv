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

use hyper::{Body, Request, Response, Server, Method, StatusCode};
use hyper::rt::{Future, Stream};
use hyper::service::service_fn;
use hyper::header::{HeaderName, HeaderValue};
use futures::future;
use std::path::{Path, PathBuf};

//use std::process::Command;
//use tokio_process::CommandExt;

type BoxFut = Box<dyn Future<Item=Response<Body>, Error=hyper::Error> + Send>;

use wlambda;
use wlambda::vval::VVal;
use wlambda::prelude::create_wlamba_prelude;
use wlambda::threads;

fn start_wlambda_thread() -> threads::Sender {
    let mut msgh = threads::MsgHandle::new();

    let sender = msgh.sender();

    std::thread::spawn(move || {
        let genv = create_wlamba_prelude();
        let mut wl_eval_ctx = wlambda::compiler::EvalContext::new(genv);

        match wl_eval_ctx.eval_file("main.wl") {
            Ok(_) => (),
            Err(e) => { panic!(format!("'main.wl' SCRIPT ERROR: {}", e)); }
        }

        msgh.run(&mut wl_eval_ctx);
    });

    sender
}

#[allow(dead_code)]
fn mime_for_ext(s: &str) -> String {
    String::from(
        match s {
            "css"   => "text/css",
            "js"    => "text/javascript",
            "json"  => "application/json",
            "html"  => "text/html",
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
        VVal::Nul
    } else {
        let v = VVal::vec();
        v.push(VVal::new_str(&m));
        v.push(VVal::new_str(
            &String::from_utf8(decode(&b))
            .unwrap_or(String::from(""))));
        v
    }
}

#[allow(dead_code)]
fn webmain(req: Request<Body>, snd: threads::Sender) -> BoxFut {

    let gr_snd = snd.clone();
    let get_response = move |method: String, path: String, data: VVal| {
        let v = VVal::vec();
        v.push(VVal::new_str(&method));
        v.push(VVal::new_str(&path));
        v.push(data);
        let r = gr_snd.call("req", v);
        Body::from(r.s())
    };

    let mut response = Response::new(Body::empty());

    let method : hyper::Method = req.method().clone();
    let path   = String::from(req.uri().path());
    let p : &str = &path;

    let authenticated =
        if let Some(head_val) = req.headers().get(hyper::header::AUTHORIZATION) {
            let v = VVal::vec();
            v.push(VVal::new_str(&format!("{:?}", method)));
            v.push(VVal::new_str(&String::from(&path)));
            v.push(parse_basic_auth(head_val.to_str().unwrap_or("")));
            let r = snd.call("auth", v);
            r.b()
        } else {
            false
        };

    if !authenticated {
        let r = snd.call("auth_realm", VVal::Nul);
        *response.status_mut() = StatusCode::UNAUTHORIZED;
        (*response.headers_mut()).insert(
            HeaderName::from_static("www-authenticate"),
            HeaderValue::from_str(
                &format!("Basic realm=\"{}\"", r.s_raw())).unwrap());
        return Box::new(future::ok(response));
    }

    println!("* {:?} {}", method, path);
    match (&method, p) {
        (&Method::POST, path) => {
            let spath = String::from(path);
            let res = req.into_body().concat2().map(move |chunk| {
                let body : Vec<u8> = chunk.iter().cloned().collect();
                match String::from_utf8(body) {
                    Ok(b) => {
                        match serde_json::from_str::<VVal>(&b) {
                            Ok(v) => {
                                *response.body_mut() =
                                    get_response(
                                        format!("{:?}", method), spath, v);
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
        (&Method::GET, path) => {
            println!("GET REQUEST: {}", path);
            let spath = String::from(path);
            let path = Path::new(path);
            if path.starts_with("/files/") {
                let webdata_path = match path.strip_prefix("/files") {
                    Ok(p) => p,
                    _ => {
                        *response.status_mut() = StatusCode::NOT_FOUND;
                        return Box::new(future::ok(response));
                    }
                };

                let mut p = PathBuf::from("webdata/");
                p.push(webdata_path);

                println!("GET PATH: {:?}", &p);
                let as_path = p;
                if as_path.is_file() {
                    let text = vec![std::fs::read(&as_path).unwrap()];

                    if let Some(extension) = as_path.extension() {
                        let mime = mime_for_ext(extension.to_str().unwrap());
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
                *response.body_mut() = get_response(format!("{:?}", method), spath, VVal::Nul);

            }
        },
        _ => {
            *response.status_mut() = StatusCode::NOT_FOUND;
        },
    };

    Box::new(future::ok(response))
}

#[allow(dead_code)]
fn start_server() {
    let sender = start_wlambda_thread();

    let sa : std::net::SocketAddr =
        sender.call("local_endpoint", VVal::Nul).s_raw()
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
    start_server();
}
