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

use serde_json::{Value};
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
//use wlambda::vval::{Env};

struct Exec {
    do_exec: bool,
    path: String,
    method: String,
    response: Option<String>,
}

fn start_wlambda_thread() -> std::sync::Arc<(std::sync::Mutex<Exec>, std::sync::Condvar)> {
    let a = std::sync::Arc::new((std::sync::Mutex::new(Exec {
        do_exec: false,
        path: String::from(""),
        method: String::from(""),
        response: None,
    }), std::sync::Condvar::new()));

    let a2 = a.clone();
    std::thread::spawn(move || {
        let genv = create_wlamba_prelude();

        let mut wl_eval_ctx =
            wlambda::compiler::EvalContext::new_with_user(
                genv,
                std::rc::Rc::new(std::cell::RefCell::new(0)));

        match wl_eval_ctx.eval_file("main.wl") {
            Ok(_) => (),
            Err(e) => { panic!(format!("AUDIO SCRIPT ERROR: {}", e)); }
        }

        let req_cb = wl_eval_ctx.get_global_var("req");
        if req_cb.is_none() {
            panic!("script did not setup a global draw() function!");
        }
        let req_cb = req_cb.unwrap();
        if !req_cb.is_fun() {
            panic!("script did not setup a global draw() function!");
        }

        loop {
            println!("YY1");
            let &(ref ex, ref cvar) = &*a2;
            let mut req = ex.lock().unwrap();
            println!("YY2");
            while !req.do_exec {
                req = cvar.wait(req).unwrap();
            }
            println!("YY3");

            let ret =
                wl_eval_ctx.call(
                    &req_cb,
                    &vec![VVal::new_str(&req.method), VVal::new_str(&req.path), VVal::Nul]).unwrap();
            println!("YY4");
            req.response = Some(ret.s());
            req.do_exec = false;
            cvar.notify_one();
            println!("YY5");
        }
    });
    a
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

#[allow(dead_code)]
fn webmain(req: Request<Body>, ctx: std::sync::Arc<(std::sync::Mutex<Exec>, std::sync::Condvar)>) -> BoxFut {

    let get_response = move |method: String, path: String| {
        {
            let &(ref ex, ref cvar) = &*ctx;
            let mut req = ex.lock().unwrap();
            println!("XX");
            while req.do_exec {
                req = cvar.wait(req).unwrap();
            }
            println!("XX2");
            req.do_exec = true;
            req.method = format!("{:?}", method);
            req.path = path;
            req.response = None;

            cvar.notify_one();
            println!("XX3");
        }

        {
            let &(ref ex, ref cvar) = &*ctx;
            let mut req = ex.lock().unwrap();
            println!("XX4");
            while req.response.is_none() {
                req = cvar.wait(req).unwrap();
            }
            println!("XX5");
            Body::from(req.response.clone().unwrap())
        }
    };

    let mut response = Response::new(Body::empty());

    let method : hyper::Method = req.method().clone();
    let path   = String::from(req.uri().path());
    let p : &str = &path;
    match (&method, p) {
        (&Method::POST, path) => {
            let spath = String::from(path);
            let res = req.into_body().concat2().map(move |chunk| {
                let body : Vec<u8> = chunk.iter().cloned().collect();
                match String::from_utf8(body) {
                    Ok(b) => {
                        match serde_json::from_str::<Value>(&b) {
                            Ok(v) => {
                                println!("FO {}", v);
                                *response.body_mut() =
                                    get_response(
                                        format!("{:?}", method), spath);
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
                *response.body_mut() = get_response(format!("{:?}", method), spath);

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
    let addr = ([127, 0, 0, 1], 19099).into();

    let a = start_wlambda_thread();

    let server = Server::bind(&addr)
        .serve(move || {
            let a2 = a.clone();
            service_fn(move |req: Request<Body>| webmain(req, a2.clone()))
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
